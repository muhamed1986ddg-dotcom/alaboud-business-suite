package com.alaboud.businesssuite

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.JavascriptInterface
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    companion object {
        private const val APP_URL = "https://alaboud-business-suite-2.onrender.com/"
        private const val FILE_CHOOSER_REQUEST = 9001
        private const val NOTIFICATION_PERMISSION_REQUEST = 9002
        private const val CHANNEL_ID = "alaboud_overdue_customers"
    }

    private lateinit var webView: WebView
    private lateinit var refreshLayout: SwipeRefreshLayout
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        createNotificationChannel()
        requestNotificationPermission()

        refreshLayout = findViewById(R.id.refreshLayout)
        webView = findViewById(R.id.webView)

        configureWebView()
        configureDownloads()
        webView.clearCache(false)

        refreshLayout.setOnRefreshListener { webView.reload() }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        if (savedInstanceState == null) {
            webView.loadUrl(APP_URL)
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            userAgentString = "$userAgentString AlAboudMobile/15.0"
        }

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        webView.addJavascriptInterface(NativeBridge(this), "AlAboudNative")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val uri = request?.url ?: return false
                val scheme = uri.scheme?.lowercase()

                if (scheme == "http" || scheme == "https") {
                    if (uri.host?.contains("onrender.com") == true) return false
                    openExternal(uri)
                    return true
                }

                if (scheme in listOf("whatsapp", "tel", "mailto", "sms", "intent")) {
                    openExternal(uri)
                    return true
                }

                return false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                refreshLayout.isRefreshing = false
                injectMobileNavigation()
                checkOverdueCustomers()
                super.onPageFinished(view, url)
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true) {
                    refreshLayout.isRefreshing = false
                    view?.loadDataWithBaseURL(
                        null,
                        offlineHtml(),
                        "text/html",
                        "UTF-8",
                        null
                    )
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                callback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback

                val chooserIntent = fileChooserParams?.createIntent()
                    ?: Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                        type = "*/*"
                        addCategory(Intent.CATEGORY_OPENABLE)
                    }

                return try {
                    startActivityForResult(chooserIntent, FILE_CHOOSER_REQUEST)
                    true
                } catch (_: ActivityNotFoundException) {
                    filePathCallback = null
                    Toast.makeText(
                        this@MainActivity,
                        "لا يوجد تطبيق لاختيار الملف",
                        Toast.LENGTH_LONG
                    ).show()
                    false
                }
            }
        }
    }

    private fun configureDownloads() {
        webView.setDownloadListener(
            DownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
                try {
                    val fileName = URLUtil.guessFileName(url, contentDisposition, mimeType)
                    val request = DownloadManager.Request(Uri.parse(url)).apply {
                        setMimeType(mimeType)
                        addRequestHeader("User-Agent", userAgent)
                        CookieManager.getInstance().getCookie(url)?.let {
                            addRequestHeader("Cookie", it)
                        }
                        setTitle(fileName)
                        setDescription("تنزيل ملف من AlAboud Business Suite")
                        setNotificationVisibility(
                            DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
                        )
                        setDestinationInExternalPublicDir(
                            Environment.DIRECTORY_DOWNLOADS,
                            fileName
                        )
                    }

                    val manager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                    manager.enqueue(request)
                    Toast.makeText(this, "بدأ تنزيل الملف", Toast.LENGTH_SHORT).show()
                } catch (_: Exception) {
                    Toast.makeText(this, "تعذر تنزيل الملف", Toast.LENGTH_LONG).show()
                }
            }
        )
    }


    private fun injectMobileNavigation() {
        val script = """
            (function () {
              try {
                if (window.__alaboudMobileMenuInstalled) return;
                window.__alaboudMobileMenuInstalled = true;

                var style = document.createElement('style');
                style.id = 'alaboud-mobile-menu-style';
                style.textContent = `
                  @media (max-width: 900px) {
                    html, body { overflow-x: hidden !important; }
                    .app { display: block !important; min-height: 100vh !important; }
                    .app > aside {
                      position: fixed !important;
                      top: 0 !important;
                      right: -310px !important;
                      left: auto !important;
                      width: 285px !important;
                      height: 100vh !important;
                      z-index: 2147483001 !important;
                      overflow-y: auto !important;
                      transition: right .25s ease !important;
                      padding-top: 76px !important;
                      box-shadow: -10px 0 30px rgba(0,0,0,.35) !important;
                    }
                    .app > aside.alaboud-menu-open { right: 0 !important; }
                    .app > main {
                      width: 100% !important;
                      max-width: 100% !important;
                      margin: 0 !important;
                      padding: 72px 12px 20px !important;
                      box-sizing: border-box !important;
                    }
                    .app > aside h1 { display:none !important; }
                    .app > aside button {
                      display:block !important;
                      width:calc(100% - 20px) !important;
                      margin:7px 10px !important;
                      min-height:46px !important;
                      border-radius:12px !important;
                    }
                    .app > aside button.alaboud-active-page {
                      background: linear-gradient(135deg,#d4af37,#f4d675) !important;
                      color:#111 !important;
                      font-weight:900 !important;
                      box-shadow:0 5px 16px rgba(212,175,55,.35) !important;
                    }
                  }

                  #alaboud-mobile-header {
                    display:none;
                  }
                  @media (max-width:900px) {
                    #alaboud-mobile-header {
                      display:flex !important;
                      position:fixed !important;
                      top:0 !important;
                      left:0 !important;
                      right:0 !important;
                      height:60px !important;
                      z-index:2147483003 !important;
                      align-items:center !important;
                      justify-content:space-between !important;
                      padding:0 14px !important;
                      background:linear-gradient(135deg,#050505,#171717) !important;
                      color:#d4af37 !important;
                      border-bottom:1px solid rgba(212,175,55,.5) !important;
                      box-shadow:0 4px 18px rgba(0,0,0,.28) !important;
                      box-sizing:border-box !important;
                    }
                    #alaboud-mobile-header button {
                      border:1px solid rgba(212,175,55,.7) !important;
                      background:#111 !important;
                      color:#f4d675 !important;
                      width:43px !important;
                      height:43px !important;
                      padding:0 !important;
                      border-radius:12px !important;
                      font-size:25px !important;
                      line-height:1 !important;
                    }
                    #alaboud-mobile-title {
                      font-weight:900 !important;
                      font-size:17px !important;
                      direction:rtl !important;
                    }
                    #alaboud-mobile-overlay {
                      display:none;
                      position:fixed !important;
                      inset:0 !important;
                      z-index:2147483000 !important;
                      background:rgba(0,0,0,.55) !important;
                      backdrop-filter:blur(2px);
                    }
                    #alaboud-mobile-overlay.alaboud-overlay-open {
                      display:block !important;
                    }
                  }
                `;
                document.head.appendChild(style);

                var aside = document.querySelector('.app > aside');
                var app = document.querySelector('.app');
                if (!aside || !app) return;

                var header = document.createElement('div');
                header.id = 'alaboud-mobile-header';
                header.innerHTML =
                  '<button id="alaboud-mobile-menu-button" aria-label="القائمة">☰</button>' +
                  '<div id="alaboud-mobile-title">AlAboud Business Suite</div>' +
                  '<button id="alaboud-mobile-home-button" aria-label="الرئيسية">⌂</button>';
                document.body.appendChild(header);

                var overlay = document.createElement('div');
                overlay.id = 'alaboud-mobile-overlay';
                document.body.appendChild(overlay);

                function openMenu() {
                  aside.classList.add('alaboud-menu-open');
                  overlay.classList.add('alaboud-overlay-open');
                }

                function closeMenu() {
                  aside.classList.remove('alaboud-menu-open');
                  overlay.classList.remove('alaboud-overlay-open');
                }

                function markActive(button) {
                  Array.prototype.forEach.call(
                    aside.querySelectorAll('button'),
                    function (item) { item.classList.remove('alaboud-active-page'); }
                  );
                  if (button && !button.classList.contains('logout')) {
                    button.classList.add('alaboud-active-page');
                    var title = button.textContent.trim();
                    document.getElementById('alaboud-mobile-title').textContent = title;
                  }
                }

                document.getElementById('alaboud-mobile-menu-button')
                  .addEventListener('click', openMenu);

                document.getElementById('alaboud-mobile-home-button')
                  .addEventListener('click', function () {
                    var buttons = aside.querySelectorAll('button');
                    if (buttons.length) {
                      buttons[0].click();
                      markActive(buttons[0]);
                    }
                    closeMenu();
                  });

                overlay.addEventListener('click', closeMenu);

                aside.addEventListener('click', function (event) {
                  var button = event.target.closest('button');
                  if (!button) return;
                  markActive(button);
                  setTimeout(closeMenu, 80);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                });

                var firstButton = aside.querySelector('button:not(.logout)');
                if (firstButton) markActive(firstButton);

                // Close the menu after browser back/forward navigation.
                window.addEventListener('popstate', closeMenu);
              } catch (error) {
                console.log('AlAboud mobile navigation error', error);
              }
            })();
        """.trimIndent()

        webView.evaluateJavascript(script, null)
    }

    private fun checkOverdueCustomers() {
        val script = """
            (function() {
              try {
                var token = localStorage.getItem('afs_token');
                if (!token) return;
                fetch('/api/customer-alerts', {
                  headers: { Authorization: 'Bearer ' + token }
                })
                .then(function(response) { return response.json(); })
                .then(function(data) {
                  if (data && Number(data.count || 0) > 0) {
                    AlAboudNative.showOverdueNotification(JSON.stringify({
                      count: Number(data.count || 0),
                      total: Number(data.totalOverdue || 0),
                      expectedToday: Number(data.expectedToday || 0)
                    }));
                  }
                })
                .catch(function(){});
              } catch (error) {}
            })();
        """.trimIndent()

        webView.evaluateJavascript(script, null)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "العملاء المتأخرون",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "تنبيهات متابعة وتحصيل العملاء المتأخرين"
            }
            getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
        }
    }

    private fun requestNotificationPermission() {
        if (
            Build.VERSION.SDK_INT >= 33 &&
            ActivityCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                NOTIFICATION_PERMISSION_REQUEST
            )
        }
    }

    fun showOverdueNotification(count: Int, total: Double, expectedToday: Double) {
        if (
            Build.VERSION.SDK_INT >= 33 &&
            ActivityCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) != PackageManager.PERMISSION_GRANTED
        ) return

        val openApp = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            3001,
            openApp,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val details = buildString {
            append("يوجد $count عميلًا متأخرًا بإجمالي %.2f CAD.".format(total))
            if (expectedToday > 0) {
                append(" المتوقع تحصيله اليوم %.2f CAD.".format(expectedToday))
            }
        }

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("تنبيه تحصيل العملاء")
            .setContentText(details)
            .setStyle(NotificationCompat.BigTextStyle().bigText(details))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        NotificationManagerCompat.from(this).notify(3001, notification)
    }

    private fun openExternal(uri: Uri) {
        try {
            val intent = if (uri.scheme == "intent") {
                Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME)
            } else {
                Intent(Intent.ACTION_VIEW, uri)
            }
            startActivity(intent)
        } catch (_: Exception) {
            Toast.makeText(this, "تعذر فتح الرابط", Toast.LENGTH_SHORT).show()
        }
    }

    private fun offlineHtml(): String = """
        <!doctype html>
        <html lang="ar" dir="rtl">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <style>
            body{font-family:sans-serif;background:#f4f7fb;color:#172033;padding:30px;text-align:center}
            .card{max-width:520px;margin:80px auto;background:#fff;padding:28px;border-radius:20px;box-shadow:0 8px 30px #0002}
            button{background:#0f6b46;color:#fff;border:0;padding:13px 25px;border-radius:12px;font-size:16px}
          </style>
        </head>
        <body>
          <div class="card">
            <h2>لا يوجد اتصال بالإنترنت</h2>
            <p>تحقق من الإنترنت ثم اضغط إعادة المحاولة.</p>
            <button onclick="location.href='$APP_URL'">إعادة المحاولة</button>
          </div>
        </body>
        </html>
    """.trimIndent()

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            val result = if (resultCode == Activity.RESULT_OK) {
                WebChromeClient.FileChooserParams.parseResult(resultCode, data)
            } else null

            filePathCallback?.onReceiveValue(result)
            filePathCallback = null
            return
        }
        super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    class NativeBridge(private val activity: MainActivity) {
        @JavascriptInterface
        fun showOverdueNotification(payload: String) {
            try {
                val json = JSONObject(payload)
                val count = json.optInt("count", 0)
                val total = json.optDouble("total", 0.0)
                val expectedToday = json.optDouble("expectedToday", 0.0)

                if (count > 0) {
                    activity.runOnUiThread {
                        activity.showOverdueNotification(count, total, expectedToday)
                    }
                }
            } catch (_: Exception) {
            }
        }
    }
}
