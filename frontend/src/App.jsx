import React,{useEffect,useState}from"react";import api from"./api";
const money=n=>Number(n||0).toFixed(2);
const cad=n=>`${money(n)} CAD`;

function openRegularWhatsApp(phone,message){
  const cleanPhone=String(phone||"").replace(/\D/g,"");
  const encodedText=encodeURIComponent(String(message||""));

  if(!cleanPhone)return false;

  const isAndroid=/Android/i.test(navigator.userAgent||"");
  if(isAndroid){
    const intentUrl=`intent://send?phone=${cleanPhone}&text=${encodedText}#Intent;scheme=whatsapp;package=com.whatsapp;end`;
    window.location.href=intentUrl;
    return true;
  }

  window.open(`https://wa.me/${cleanPhone}?text=${encodedText}`,"_blank");
  return true;
}


const currencyFlag=code=>String(code||"").toUpperCase();

function CurrencyFlag({code,className=""}){
  const normalized=String(code||"").toUpperCase();
  const supported=["CAD","USD","EUR","GBP","AED","TRY","SYP","SAR"];
  const goldCodes=["XAU24","XAU22","XAU21","XAU18"];
  if(goldCodes.includes(normalized)){
    return <span className={`gold-rate-icon ${className}`} aria-label="gold">ًںھ™</span>;
  }
  if(supported.includes(normalized)){
    return <img
      className={`currency-flag-image ${normalized==="SYP"?"syria-new-flag":""} ${className}`}
      src={`/currency-flags/${normalized.toLowerCase()}.svg`}
      alt={`${normalized} flag`}
    />;
  }
  return <span className={className}>ًںڈ³ï¸ڈ</span>;
}

function rateTrend(rate,history=[]){
  const pairHistory=history
    .filter(item=>item.baseCurrency===rate.baseCurrency&&item.quoteCurrency===rate.quoteCurrency)
    .sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
  const previous=pairHistory.find(item=>item.id!==rate.id);
  if(!previous)return {type:"new",symbol:"â—ڈ",label:"ط¬ط¯ظٹط¯"};
  const currentValue=Number(rate.sellRate||rate.buyRate||0);
  const previousValue=Number(previous.sellRate||previous.buyRate||0);
  if(currentValue>previousValue)return {type:"up",symbol:"â–²",label:"طµط¹ظˆط¯"};
  if(currentValue<previousValue)return {type:"down",symbol:"â–¼",label:"ظ†ط²ظˆظ„"};
  return {type:"same",symbol:"â†’",label:"ط«ط§ط¨طھ"};
}


class AppErrorBoundary extends React.Component{
  constructor(props){
    super(props);
    this.state={error:null};
  }
  static getDerivedStateFromError(error){
    return {error};
  }
  componentDidCatch(error,info){
    console.error("Application error:",error,info);
  }
  render(){
    if(this.state.error){
      return <div className="card customer-error">
        <h2>ط­ط¯ط« ط®ط·ط£ ظپظٹ ط§ظ„طµظپط­ط©</h2>
        <p>{String(this.state.error.message||this.state.error)}</p>
        <button onClick={()=>window.location.reload()}>ط¥ط¹ط§ط¯ط© طھط­ظ…ظٹظ„ ط§ظ„ط¨ط±ظ†ط§ظ…ط¬</button>
      </div>;
    }
    return this.props.children;
  }
}


const APP_EN_TRANSLATIONS={
  "ط§ظ„ظ‚ط§ط¦ظ…ط© ط§ظ„ط±ط¦ظٹط³ظٹط©":"Main Dashboard","ط§ظ„ط±ط¦ظٹط³ظٹط©":"Home","ط§ظ„ظ‚ط§ط¦ظ…ط©":"Menu","ط§ظ„ط¹ظ…ظ„ط§ط،":"Customers",
  "ط§ظ„ط¹ظ…ظ„ط§ط، ط§ظ„ظ…طھط£ط®ط±ظˆظ†":"Overdue Customers","ط§ظ„ط´ط±ظƒط§طھ":"Companies",
  "ط§ظ„ط­ظˆط§ظ„ط§طھ":"Transfers","ط§ظ„ط£ط±ط¨ط§ط­":"Profits","ط§ظ„ط¹ظ…ظ„ط§طھ ظˆط£ط³ط¹ط§ط± ط§ظ„طµط±ظپ":"Currencies & Exchange Rates",
  "ط§ظ„ط¯ظ‘ظژظٹظ† ط§ظ„ط¹ط§ظ…":"General Debts","ط§ظ„ظ…ظٹط²ط§ظ†ظٹط©":"Budget","ط§ظ„طھظ‚ط§ط±ظٹط± ط§ظ„ط´ظ‡ط±ظٹط©":"Monthly Reports",
  "ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„طھظ†ط¨ظٹظ‡ط§طھ":"Alert Settings","ط§ظ„ط¥ط¹ط¯ط§ط¯ط§طھ":"Settings","ط§ظ„ظ…طµط±ظˆظپط§طھ":"Expenses","ط­ط±ظƒط© ط±ط£ط³ ط§ظ„ظ…ط§ظ„":"Capital Movement",
  "طھط³ط¬ظٹظ„ ط§ظ„ط®ط±ظˆط¬":"Log out","ظ‡ظ„ طھط±ظٹط¯ طھط³ط¬ظٹظ„ ط§ظ„ط®ط±ظˆط¬ ظ…ظ† ط§ظ„ط¨ط±ظ†ط§ظ…ط¬طں":"Do you want to log out of the application?",
  "ظ†ط¹ظ…طŒ طھط³ط¬ظٹظ„ ط§ظ„ط®ط±ظˆط¬":"Yes, log out","ط¥ظ„ط؛ط§ط،":"Cancel","ط§ظ„ط¹ظˆط¯ط© ط¥ظ„ظ‰ ط§ظ„ظ‚ط§ط¦ظ…ط© ط§ظ„ط±ط¦ظٹط³ظٹط©":"Back to Main Dashboard",
  "ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ط§ظ„طھط¬ط§ط±ظٹط©":"AlAboud Trading Company","ط¥ط¯ط§ط±ط© ط§ظ„ط­ظˆط§ظ„ط§طھ ظˆط§ظ„ط­ط³ط§ط¨ط§طھ":"Transfers & Accounts Management",
  "ط§ظ„ط¨ط±ظٹط¯":"Email","ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط±":"Password","طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„":"Sign in","ظپط´ظ„ طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„":"Login failed",
  "ط¬ط§ط±ظٹ طھط­ظ…ظٹظ„ ظ„ظˆط­ط© ط§ظ„طھط­ظƒظ…â€¦":"Loading dashboardâ€¦","ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط­ظˆط§ظ„ط§طھ":"Total Transfers","ط­ظˆط§ظ„ط§طھ ط§ظ„ظٹظˆظ…":"Today's Transfers",
  "ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط£ط±ط¨ط§ط­":"Total Profit","ط§ظ„ط±ط¨ط­ ط§ظ„ظٹظˆظ…ظٹ":"Daily Profit","ظ…طµط±ظˆظپط§طھ ط§ظ„ظٹظˆظ…":"Today's Expenses",
  "ط¹ط¯ط¯ ط§ظ„ط¹ظ…ظ„ط§ط،":"Customers","ظ…ظ„ط®طµ ط§ظ„ظٹظˆظ…":"Today's Summary","ظ†ط´ط±ط© ط£ط³ط¹ط§ط± ط§ظ„طµط±ظپ":"Exchange Rate Board",
  "ط¹ط±ط¶ ط§ظ„ظƒظ„":"View All","ط£ط­ط¯ط« ط§ظ„ط­ظˆط§ظ„ط§طھ":"Latest Transfers","ط¥ط¶ط§ظپط© ط­ظˆط§ظ„ط©":"Add Transfer","ط¥ط¶ط§ظپط© ط¹ظ…ظٹظ„":"Add Customer",
  "ط¥ط¶ط§ظپط© ظ…طµط±ظˆظپ":"Add Expense","طھظ‚ط±ظٹط± ط³ط±ظٹط¹":"Quick Report","طھط­ط¯ظٹط« ط£ط³ط¹ط§ط± ط§ظ„طµط±ظپ":"Refresh Exchange Rates",
  "ظ‚ط§ط¦ظ…ط© ط§ظ„ط¹ظ…ظ„ط§ط،":"Customer List","ط¨ط­ط« ط¨ط§ط³ظ… ط§ظ„ط¹ظ…ظٹظ„ ط£ظˆ ط±ظ‚ظ… ط§ظ„ظ‡ط§طھظپ":"Search by customer name or phone",
  "ظ…ط¬ظ…ظˆط¹ ط§ظ„ط­ط³ط§ط¨ط§طھ ط§ظ„ظƒظ„ظٹ":"Total Accounts","ظ…ط¬ظ…ظˆط¹ ط§ظ„ظ…ط¯ظپظˆط¹":"Total Paid","ط§ظ„ظ…ط¬ظ…ظˆط¹ ط§ظ„ظ†ظ‡ط§ط¦ظٹ (CAD) ط§ظ„ظ…طھط¨ظ‚ظٹ":"Final Remaining Total (CAD)",
  "ط§ظ„ظ…طھط£ط®ط±ظˆظ† ط£ظƒط«ط± ظ…ظ† ط£ط³ط¨ظˆط¹":"Overdue More Than a Week","ظ…ط¬ظ…ظˆط¹ ط§ظ„ط­ط³ط§ط¨":"Account Total","ط§ظ„ظ…ط¯ظپظˆط¹":"Paid",
  "ظپطھط­ ط§ظ„ط­ط³ط§ط¨":"Open Account","ط¥ط¶ط§ظپط© ط¯ظپط¹ط©":"Add Payment","طھط¹ط¯ظٹظ„":"Edit","ظˆط§طھط³ط§ط¨ ظƒط´ظپ ط§ظ„ط­ط³ط§ط¨":"WhatsApp Final Total (CAD)",
  "ظ…ط³طھط­ظ‚":"Due","ظ…ط³ط¯ط¯":"Paid","ظ„ط§ ظٹظˆط¬ط¯ ط±ظ‚ظ… ظ‡ط§طھظپ":"No phone number",
  "ط­ظپط¸ ط§ظ„ط­ظˆط§ظ„ط©":"Save Transfer","ظ…ط¯ظپظˆط¹":"Paid","ط؛ظٹط± ظ…ط¯ظپظˆط¹":"Unpaid","ط£ط¬ظˆط± ط§ظ„ط­ظˆط§ظ„ط©":"Transfer Fee",
  "ط±ط¨ط­ ط§ظ„ط­ظˆط§ظ„ط©":"Transfer Profit","ط§ظ„ظ…ط¬ظ…ظˆط¹ ط§ظ„ظ†ظ‡ط§ط¦ظٹ (CAD) ظ„ظ„ط¹ظ…ظٹظ„":"Customer Final Total (CAD)",
  "ط³ط¹ط± ط§ظ„طھط­ظˆظٹظ„ ظ„ظ„ط¹ظ…ظٹظ„":"Customer Exchange Rate","ط§ظ„ط³ط¹ط± ط§ظ„ط°ظٹ ظٹط­ط§ط³ط¨ ط¹ظ„ظٹظ‡ ط§ظ„ط¹ظ…ظٹظ„ ظ…ظ‚ط§ط¨ظ„ ظƒظ„ ظˆط­ط¯ط© ظ…ظ† ط¹ظ…ظ„ط© ط§ظ„ط­ظˆط§ظ„ط©":"Rate charged to the customer for each transfer currency unit",
  "ط¢ط®ط± طھط­ط¯ظٹط«":"Last Update","ط´ط±ط§ط،":"Buy","ط¨ظٹط¹":"Sell","طµط¹ظˆط¯":"Up","ظ†ط²ظˆظ„":"Down","ط«ط§ط¨طھ":"Stable",
  "ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„طھظ†ط¨ظٹظ‡ط§طھ ظˆظˆط§طھط³ط§ط¨":"Alerts & WhatsApp Settings","ط¨ط¯ط، طھظ†ط¨ظٹظ‡ ط§ظ„طھط£ط®ظٹط± ط¨ط¹ط¯ ط¹ط¯ط¯ ط§ظ„ط£ظٹط§ظ…":"Start overdue alert after days",
  "ط­ط¯ ط§ظ†ط®ظپط§ط¶ ط§ظ„ط³ظٹظˆظ„ط© (CAD)":"Low Cash Limit (CAD)","ظ‚ط§ظ„ط¨ ط±ط³ط§ظ„ط© ظˆط§طھط³ط§ط¨ (ط§ط®طھظٹط§ط±ظٹ)":"WhatsApp Message Template (Optional)",
  "ط­ظپط¸ ط§ظ„ط¥ط¹ط¯ط§ط¯ط§طھ":"Save Settings","ظ…ظ„ط§ط­ط¸ط©:":"Note:","ط§ظ„ظ„ط؛ط©":"Language","ط·ط±ظٹظ‚ط© ط§ظ„ط¹ط±ط¶":"Display Mode",
  "ظ…ط¶ط؛ظˆط·":"Compact","ظ…ط±ظٹط­":"Comfortable","ظƒط¨ظٹط±":"Large","ط§ظ„ط¹ظ…ظ„ط© ط§ظ„ط±ط¦ظٹط³ظٹط©":"Primary Currency",
  "ط­ظپط¸ ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„ط¹ط±ط¶":"Save Display Settings","ط¥ظ†ط´ط§ط، ط­ط³ط§ط¨":"Create Account","ط§ط³ظ… ط§ظ„ظ…ط³طھط®ط¯ظ…":"User Name",
  "ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ":"Email Address","ظ…ط³طھط®ط¯ظ…":"User","ظ…ط¯ظٹط±":"Manager","ظ…ط³ط¤ظˆظ„ ظƒط§ظ…ظ„":"Full Administrator",
  "ط¥ظ†ط´ط§ط، ط§ظ„ط­ط³ط§ط¨":"Create Account","طھط؛ظٹظٹط± ظƒظ„ظ…ط© ط§ظ„ط³ط±":"Change Password","ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± ط§ظ„ط­ط§ظ„ظٹط©":"Current Password",
  "ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± ط§ظ„ط¬ط¯ظٹط¯ط©":"New Password","طھط£ظƒظٹط¯ ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± ط§ظ„ط¬ط¯ظٹط¯ط©":"Confirm New Password",
  "ط§ظ„ط¯ط¹ظ… ط§ظ„ظپظ†ظٹ":"Technical Support","ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ظپظ†ظٹ":"Support Email","ظ†ط³ط® ط±ظ‚ظ… ط§ظ„ط¥طµط¯ط§ط±":"Copy Version Number",
  "ط§ظ„طھط­ط¯ظٹط«ط§طھ":"Updates","ط§ظ„ط¥طµط¯ط§ط± ط§ظ„ط­ط§ظ„ظٹ":"Current Version","ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ط§ظ„طھط­ط¯ظٹط«ط§طھ":"Check for Updates",
  "ط¬ط§ط±ظٹ ط§ظ„طھط­ظ‚ظ‚...":"Checking...","طھظ… ط­ظپط¸ ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„ط¹ط±ط¶":"Display settings saved",
  "طھظ… ط¥ظ†ط´ط§ط، ط§ظ„ط­ط³ط§ط¨ ط¨ظ†ط¬ط§ط­":"Account created successfully","طھظ… طھط؛ظٹظٹط± ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± ط¨ظ†ط¬ط§ط­":"Password changed successfully",
  "طھظ… ظ†ط³ط® ط±ظ‚ظ… ط§ظ„ط¥طµط¯ط§ط±":"Version number copied","ط­ظپط¸":"Save","ط§ظ„ظˆطµظپ":"Description","ط§ظ„ظ…ط¨ظ„ط؛":"Amount",
  "ط²ظٹط§ط¯ط©":"Deposit","ط³ط­ط¨":"Withdrawal","ط±ط£ط³ ط§ظ„ظ…ط§ظ„":"Capital","ظ„ط§ طھظˆط¬ط¯ ط¨ظٹط§ظ†ط§طھ.":"No data available.",
  "ظ„ط§ طھظˆط¬ط¯ ط­ظˆط§ظ„ط§طھ.":"No transfers.","ظ„ط§ طھظˆط¬ط¯ ط­ظˆط§ظ„ط§طھ ظپظٹ ظ‡ط°ط§ ط§ظ„ط´ظ‡ط±.":"No transfers this month.",
  "ط§ظ„ط¹ظ…ظٹظ„":"Customer","ط§ظ„طھط§ط±ظٹط®":"Date","ط§ظ„ط±ظ‚ظ…":"Number","ط§ظ„ط£ط¬ظˆط±":"Fees","ط§ظ„ط±ط¨ط­":"Profit",
  "طھظپط§طµظٹظ„ ط­ظˆط§ظ„ط§طھ ط§ظ„ط´ظ‡ط±":"Monthly Transfer Details","ط£ظƒط«ط± ط§ظ„ط¹ظ…ظ„ط§ط، طھط¹ط§ظ…ظ„ظ‹ط§ ط®ظ„ط§ظ„ ط§ظ„ط´ظ‡ط±":"Top Customers This Month",
  "ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط­ظˆط§ظ„ط§طھ":"Total Transfers","ط¬ط§ط±ظٹ ط§ظ„طھط­ظ…ظٹظ„...":"Loading...","ط­ط¯ط« ط®ط·ط£ ظپظٹ ط§ظ„طµظپط­ط©":"Page Error",
  "ط¥ط¹ط§ط¯ط© طھط­ظ…ظٹظ„ ط§ظ„ط¨ط±ظ†ط§ظ…ط¬":"Reload Application"
};

function translateAppText(value){
  if(typeof value!=="string")return value;
  const direct=APP_EN_TRANSLATIONS[value.trim()];
  if(direct)return direct;
  let output=value;
  Object.entries(APP_EN_TRANSLATIONS)
    .sort((a,b)=>b[0].length-a[0].length)
    .forEach(([ar,en])=>{output=output.split(ar).join(en)});
  return output;
}

function AppLanguageBridge(){
  useEffect(()=>{
    const applyLanguage=()=>{
      const language=localStorage.getItem("alaboud_language")||"ar";
      const english=language==="en";
      document.documentElement.lang=language;
      document.documentElement.dir=english?"ltr":"rtl";
      document.body.classList.toggle("app-language-en",english);

      document.querySelectorAll("body *").forEach(node=>{
        if(node.closest("script,style"))return;
        node.childNodes.forEach(child=>{
          if(child.nodeType===Node.TEXT_NODE){
            if(english){
              if(child.__alaboudArabicOriginal===undefined)child.__alaboudArabicOriginal=child.nodeValue;
              child.nodeValue=translateAppText(child.__alaboudArabicOriginal);
            }else if(child.__alaboudArabicOriginal!==undefined){
              child.nodeValue=child.__alaboudArabicOriginal;
            }
          }
        });

        ["placeholder","title","aria-label"].forEach(attribute=>{
          if(!node.hasAttribute?.(attribute))return;
          const key=`alaboudOriginal${attribute.replace("-","")}`;
          if(english){
            if(node.dataset[key]===undefined)node.dataset[key]=node.getAttribute(attribute)||"";
            node.setAttribute(attribute,translateAppText(node.dataset[key]));
          }else if(node.dataset[key]!==undefined){
            node.setAttribute(attribute,node.dataset[key]);
          }
        });
      });
    };

    applyLanguage();
    const observer=new MutationObserver(()=>applyLanguage());
    observer.observe(document.body,{childList:true,subtree:true,characterData:false});
    window.addEventListener("alaboud-language-change",applyLanguage);
    return()=>{
      observer.disconnect();
      window.removeEventListener("alaboud-language-change",applyLanguage);
    };
  },[]);
  return null;
}

function Login({onLogin}){
  const [mode,setMode]=useState("login");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [form,setForm]=useState({ownerName:"",companyName:"",email:"",phone:"",password:"",confirmPassword:""});
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  function saveSession(data){
    localStorage.setItem("afs_token",data.token);
    localStorage.setItem("afs_user",JSON.stringify(data.user));
    onLogin();
  }

  async function submitLogin(e){
    e.preventDefault();setError("");setBusy(true);
    try{const {data}=await api.post("/auth/login",{email,password});saveSession(data)}
    catch(error){setError(error.response?.data?.message||"ظپط´ظ„ طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„")}
    finally{setBusy(false)}
  }

  async function submitRegister(e){
    e.preventDefault();setError("");
    if(form.password!==form.confirmPassword){setError("طھط£ظƒظٹط¯ ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± ط؛ظٹط± ظ…ط·ط§ط¨ظ‚");return}
    setBusy(true);
    try{
      const {data}=await api.post("/auth/register-company",{
        ownerName:form.ownerName,companyName:form.companyName,email:form.email,phone:form.phone,password:form.password
      });
      saveSession(data);
    }catch(error){setError(error.response?.data?.message||"طھط¹ط°ط± ط¥ظ†ط´ط§ط، ط§ظ„ط­ط³ط§ط¨")}
    finally{setBusy(false)}
  }

  return <div className="login">
    <form className="panel public-account-panel" onSubmit={mode==="login"?submitLogin:submitRegister}>
      <img className="login-company-logo" src="/alaboud-company-logo.webp" alt="ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ط§ظ„طھط¬ط§ط±ظٹط©"/>
      <h1>{mode==="login"?"طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„":"ط¥ظ†ط´ط§ط، ط­ط³ط§ط¨ ط´ط±ظƒط© ط¬ط¯ظٹط¯"}</h1>
      <p className="login-company-en">ALABOUD BUSINESS SUITE</p>
      {mode==="login"?<>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ" required/>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط±" required/>
      </>:<>
        <input value={form.ownerName} onChange={e=>setForm({...form,ownerName:e.target.value})} placeholder="ط§ط³ظ… طµط§ط­ط¨ ط§ظ„ط­ط³ط§ط¨" required/>
        <input value={form.companyName} onChange={e=>setForm({...form,companyName:e.target.value})} placeholder="ط§ط³ظ… ط§ظ„ط´ط±ظƒط©" required/>
        <input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ" required/>
        <input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="ط±ظ‚ظ… ط§ظ„ظ‡ط§طھظپ"/>
        <input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± â€” 8 ط£ط­ط±ظپ ط¹ظ„ظ‰ ط§ظ„ط£ظ‚ظ„" required/>
        <input type="password" value={form.confirmPassword} onChange={e=>setForm({...form,confirmPassword:e.target.value})} placeholder="طھط£ظƒظٹط¯ ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط±" required/>
        <div className="tenant-privacy-note">ًں”’ ط³ظٹطھظ… ط¥ظ†ط´ط§ط، ظ…ط³ط§ط­ط© ط¨ظٹط§ظ†ط§طھ ظ…ط³طھظ‚ظ„ط© ظ„ط´ط±ظƒطھظƒ. ظ„ظ† طھط±ظ‰ ط¨ظٹط§ظ†ط§طھ ط£ظٹ ط´ط±ظƒط© ط£ط®ط±ظ‰.</div>
      </>}
      {error&&<div className="error">{error}</div>}
      <button disabled={busy}>{busy?"ط¬ط§ط±ظٹ ط§ظ„طھظ†ظپظٹط°...":mode==="login"?"طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„":"ط¥ظ†ط´ط§ط، ط§ظ„ط­ط³ط§ط¨ ظˆط§ظ„ط¯ط®ظˆظ„"}</button>
      <button className="account-mode-button" type="button" onClick={()=>{setMode(mode==="login"?"register":"login");setError("")}}>
        {mode==="login"?"ظ…ط³طھط®ط¯ظ… ط¬ط¯ظٹط¯طں ط¥ظ†ط´ط§ط، ط­ط³ط§ط¨ ط´ط±ظƒط©":"ظ„ط¯ظٹ ط­ط³ط§ط¨ ط¨ط§ظ„ظپط¹ظ„ â€” طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„"}
      </button>
      <small>ظٹظ…ظƒظ† ط§ط³طھط®ط¯ط§ظ… ظ†ظپط³ ط§ظ„ط­ط³ط§ط¨ ط¹ظ„ظ‰ ط£ظƒط«ط± ظ…ظ† ظ‡ط§طھظپ ظˆط³طھط¸ظ‡ط± ظ†ظپط³ ط§ظ„ط¨ظٹط§ظ†ط§طھ ط§ظ„ط³ط­ط§ط¨ظٹط©.</small>
    </form>
  </div>
}
function Dashboard({navigate}){
  const [data,setData]=useState(null);
  const [noticeData,setNoticeData]=useState({count:0,overdueCount:0,overdueTotal:0,notifications:[]});
  const [recent,setRecent]=useState([]);
  const [dashboardRates,setDashboardRates]=useState([]);
  const [dashboardRateHistory,setDashboardRateHistory]=useState([]);
  const [open,setOpen]=useState(false);

  useEffect(()=>{
    let active=true;
    const loadDashboard=async(refreshRates=false)=>{
      try{
        if(refreshRates)await api.post("/exchange-rates/refresh");
        const [dashboardResponse,notificationResponse,transactionsResponse,ratesResponse,historyResponse]=await Promise.all([
          api.get("/dashboard"),
          api.get("/notifications"),
          api.get("/transactions"),
          api.get("/exchange-rates"),
          api.get("/exchange-rates/history")
        ]);
        if(!active)return;
        setData(dashboardResponse.data);
        setNoticeData(notificationResponse.data);
        const rows=Array.isArray(transactionsResponse.data)?transactionsResponse.data:[];
        setRecent(rows.slice().sort((a,b)=>new Date(b.createdAt||b.transferDate)-new Date(a.createdAt||a.transferDate)).slice(0,4));
        const rateRows=Array.isArray(ratesResponse.data)?ratesResponse.data:[];
        const currencyOnlyRates=rateRows.filter(rate=>{
          const base=String(rate.baseCurrency||"").toUpperCase();
          const quote=String(rate.quoteCurrency||"").toUpperCase();
          return !base.startsWith("XAU")&&!quote.startsWith("XAU");
        });
        setDashboardRates(currencyOnlyRates.slice().sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))).slice(0,8));
        setDashboardRateHistory(Array.isArray(historyResponse.data)?historyResponse.data:[]);
      }catch{}
    };
    loadDashboard(false);
    const hourly=setInterval(()=>loadDashboard(true),60*60*1000);
    return ()=>{active=false;clearInterval(hourly)};
  },[]);

  if(!data)return <div className="premium-loading">ط¬ط§ط±ظٹ طھط­ظ…ظٹظ„ ظ„ظˆط­ط© ط§ظ„طھط­ظƒظ…â€¦</div>;

  const kpis=[
    {label:"ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط­ظˆط§ظ„ط§طھ",value:data.todayTransactions||0,icon:"ًں’±",tone:"green",note:"ط­ظˆط§ظ„ط§طھ ط§ظ„ظٹظˆظ…"},
    {label:"ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط£ط±ط¨ط§ط­",value:cad(data.todayProfit),icon:"ًں“ˆ",tone:"blue",note:"ط§ظ„ط±ط¨ط­ ط§ظ„ظٹظˆظ…ظٹ"},
    {label:"ط§ظ„ظ…طµط±ظˆظپط§طھ",value:cad(data.todayExpenses||0),icon:"ًں‘›",tone:"orange",note:"ظ…طµط±ظˆظپط§طھ ط§ظ„ظٹظˆظ…"},
    {label:"ط§ظ„ط¹ظ…ظ„ط§ط،",value:data.customers||0,icon:"ًں‘¥",tone:"purple",note:`${noticeData.overdueCount||0} ظ…طھط£ط®ط±`}
  ];

  return <div className="premium-dashboard">
    <section className="premium-hero dashboard-pro-hero">
      <div className="dashboard-pro-brand">
        <img src="/alaboud-company-logo.webp" alt="ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ط§ظ„طھط¬ط§ط±ظٹط©"/>
        <div><h2>ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ط§ظ„طھط¬ط§ط±ظٹط©</h2><p>v16.0.13 Enterprise <span>â—ڈ ظ…طھطµظ„</span></p></div>
      </div>
      <div className="dashboard-pro-search">âŒ• <span>ط¨ط­ط« ط³ط±ظٹط¹...</span><kbd>Ctrl + K</kbd></div>
      <div className="dashboard-pro-clock"><strong>{new Date().toLocaleTimeString("en-CA",{hour:"2-digit",minute:"2-digit"})}</strong><small>{new Date().toLocaleDateString("ar-CA",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</small></div>
    </section>

    <section className="premium-kpis">
      {kpis.map(item=><button key={item.label} className={`premium-kpi ${item.tone}`} onClick={()=>{
        if(item.label==="ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط­ظˆط§ظ„ط§طھ")navigate("transactions");
        else if(item.label==="ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط£ط±ط¨ط§ط­")navigate("profits");
        else if(item.label==="ط§ظ„ظ…طµط±ظˆظپط§طھ")navigate("expenses");
        else navigate("customers");
      }}>
        <div className="premium-kpi-icon">{item.icon}</div>
        <div><span>{item.label}</span><strong>{item.value}</strong><small>{item.note}</small></div>
      </button>)}
    </section>

    <section className="premium-grid">
      <div className="premium-recent panel-dark">
        <div className="section-heading">
          <h3>ط£ط­ط¯ط« ط§ظ„ط­ظˆط§ظ„ط§طھ</h3>
          <button onClick={()=>navigate("transactions")}>ط¹ط±ط¶ ط§ظ„ظƒظ„</button>
        </div>
        {recent.length?recent.map(item=><button className="recent-row" key={item.id} onClick={()=>navigate("transactions")}>
          <div className="recent-currency"><span>{item.currency||"USD"}</span><small>{item.number||"ط­ظˆط§ظ„ط©"}</small></div>
          <div className="recent-date">{item.transferDate||String(item.createdAt||"").slice(0,10)}</div>
          <strong>{cad(item.totalCustomerDue||0)}</strong>
          <b>â€¹</b>
        </button>):<p className="empty-state">ظ„ط§ طھظˆط¬ط¯ ط­ظˆط§ظ„ط§طھ ط­ط¯ظٹط«ط©.</p>}
      </div>

      <div className="premium-summary panel-dark dashboard-price-bulletin">
        <div className="section-heading">
          <h3>ظ†ط´ط±ط© ط£ط³ط¹ط§ط± ط§ظ„طµط±ظپ</h3>
          <button onClick={()=>navigate("rates")}>ط¹ط±ط¶ ط§ظ„ظƒظ„</button>
        </div>
        <div className="dashboard-rate-list">
          {dashboardRates.length?dashboardRates.map(rate=><button
            className="dashboard-rate-row"
            key={rate.id||`${rate.baseCurrency}-${rate.quoteCurrency}`}
            onClick={()=>navigate("rates")}
          >
            {(()=>{
              const trend=rateTrend(rate,dashboardRateHistory);
              return <>
                <strong className="dashboard-rate-pair">
                  <CurrencyFlag code={rate.baseCurrency} className="dashboard-rate-flag"/>
                  <span>{rate.baseCurrency}/{rate.quoteCurrency}</span>
                  <span className={`dashboard-rate-trend trend-${trend.type}`}>{trend.symbol}</span>
                </strong>
                <span>ط´ط±ط§ط، <b>{Number(rate.buyRate||0).toFixed(4)}</b></span>
                <span>ط¨ظٹط¹ <b>{Number(rate.sellRate||0).toFixed(4)}</b></span>
              </>;
            })()}
          </button>):<p className="empty-state">ظ„ط§ طھظˆط¬ط¯ ط£ط³ط¹ط§ط± طµط±ظپ ظ…ط³ط¬ظ„ط©.</p>}
        </div>
      </div>
    </section>

    <section className="dashboard-pro-analysis">
      <div className="dashboard-pro-performance panel-dark">
        <div className="section-heading"><h3>ظ…ظ„ط®طµ ط§ظ„ط£ط¯ط§ط، (ط¢ط®ط± 7 ط£ظٹط§ظ…)</h3><span className="dashboard-pro-period">ط¢ط®ط± 7 ط£ظٹط§ظ…</span></div>
        <div className="dashboard-pro-chart">
          <div className="dashboard-pro-grid"><i/><i/><i/><i/><i/></div>
          <div className="dashboard-pro-bars">{[38,54,61,69,82,66,77].map((value,index)=><div className="dashboard-pro-bar-col" key={index}><div className="dashboard-pro-bar" style={{height:`${value}%`}}/><small>{index+8}/7</small></div>)}</div>
          <svg viewBox="0 0 700 220" preserveAspectRatio="none"><polyline points="50,160 150,115 250,102 350,78 450,42 550,85 650,65"/></svg>
        </div>
        <div className="dashboard-pro-legend"><span>â—ڈ ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط­ظˆط§ظ„ط§طھ (CAD)</span><span>â—ڈ ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط£ط±ط¨ط§ط­</span></div>
      </div>
      <div className="dashboard-pro-finance panel-dark">
        <div className="section-heading"><h3>ط­ط±ظƒط© ط±ط£ط³ ط§ظ„ظ…ط§ظ„</h3><button onClick={()=>navigate("capital")}>ط¹ط±ط¶ ط§ظ„ظƒظ„</button></div>
        <p><span>ط§ظ„ط±طµظٹط¯ ط§ظ„ط­ط§ظ„ظٹ</span><strong>{cad(data.capital||0)}</strong></p>
        <p><span>ط§ظ„ط°ظ…ظ… ط§ظ„ظ…ط³طھط­ظ‚ط©</span><strong>{cad(data.receivables||0)}</strong></p>
        <p><span>ط§ظ„ط¹ظ…ظ„ط§ط، ط§ظ„ظ…طھط£ط®ط±ظˆظ†</span><strong>{noticeData.overdueCount||0}</strong></p>
      </div>
      <div className="dashboard-pro-alerts panel-dark">
        <div className="section-heading"><h3>ط£ط­ط¯ط« ط§ظ„طھظ†ط¨ظٹظ‡ط§طھ</h3><button onClick={()=>setOpen(!open)}>ط¹ط±ط¶ ط§ظ„ظƒظ„</button></div>
        {(noticeData.notifications||[]).slice(0,3).map(item=><div className={`dashboard-pro-alert severity-${item.severity}`} key={item.id}><b>!</b><div><strong>{item.title}</strong><small>{item.message}</small></div></div>)}
        {!noticeData.notifications?.length&&<p className="empty-state">ظ„ط§ طھظˆط¬ط¯ طھظ†ط¨ظٹظ‡ط§طھ ط­ط§ظ„ظٹط§ظ‹.</p>}
      </div>
      <div className="dashboard-pro-stats panel-dark">
        <div className="section-heading"><h3>ط¥ط­طµط§ط¦ظٹط§طھ ط³ط±ظٹط¹ط©</h3></div>
        <p><span>ط­ظˆط§ظ„ط§طھ ط§ظ„ظٹظˆظ…</span><strong>{data.todayTransactions||0}</strong></p>
        <p><span>ط£ط±ط¨ط§ط­ ط§ظ„ظٹظˆظ…</span><strong>{cad(data.todayProfit)}</strong></p>
        <p><span>ط¹ط¯ط¯ ط§ظ„ط¹ظ…ظ„ط§ط،</span><strong>{data.customers||0}</strong></p>
      </div>
    </section>

    <section className="premium-quick">
      <button onClick={()=>navigate("transactions")}><span>ًں’±</span><strong>ط¥ط¶ط§ظپط© ط­ظˆط§ظ„ط©</strong></button>
      <button onClick={()=>navigate("expenses")}><span>ًں‘›</span><strong>ط¥ط¶ط§ظپط© ظ…طµط±ظˆظپ</strong></button>
      <button onClick={()=>navigate("customers")}><span>ًں‘¤ï¼‹</span><strong>ط¹ظ…ظٹظ„ ط¬ط¯ظٹط¯</strong></button>
      <button onClick={()=>navigate("monthly-report")}><span>ًں“„</span><strong>طھظ‚ط±ظٹط± ط³ط±ظٹط¹</strong></button>
      <button onClick={()=>navigate("rates")}><span>âکپ</span><strong>ط£ط³ط¹ط§ط± ط§ظ„طµط±ظپ</strong></button>
    </section>

    <button className="premium-alert-strip" onClick={()=>setOpen(!open)}>
      <span>ًں””</span>
      <strong>{noticeData.count?`${noticeData.count} طھظ†ط¨ظٹظ‡ط§طھ طھط­طھط§ط¬ ط§ظ„ظ…ط±ط§ط¬ط¹ط©`:"ظ„ط§ طھظˆط¬ط¯ طھظ†ط¨ظٹظ‡ط§طھ ط¬ط¯ظٹط¯ط©"}</strong>
      <b>â€¹</b>
    </button>

    {open&&<div className="panel-dark premium-notifications">
      <div className="section-heading"><h3>ظ…ط±ظƒط² ط§ظ„طھظ†ط¨ظٹظ‡ط§طھ</h3><button onClick={()=>setOpen(false)}>ط¥ط؛ظ„ط§ظ‚</button></div>
      {noticeData.notifications.length?noticeData.notifications.map(item=>
        <div className={`notification-item severity-${item.severity}`} key={item.id}>
          <div><strong>{item.title}</strong><p>{item.message}</p></div>
          {item.customerId&&<button onClick={()=>navigate("customers")}>ظپطھط­</button>}
        </div>
      ):<p>ظ„ط§ طھظˆط¬ط¯ طھظ†ط¨ظٹظ‡ط§طھ ط­ط§ظ„ظٹط§ظ‹.</p>}
    </div>}
  </div>;
}


function globalBlobToDataUrl(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||""));
    reader.onerror=()=>reject(new Error("طھط¹ط°ط± طھط¬ظ‡ظٹط² ط§ظ„طµظˆط±ط© ظ„ظ„ظ…ط´ط§ط±ظƒط©"));
    reader.readAsDataURL(blob);
  });
}

async function openGlobalAndroidShareSheet(blob,file,title="طµظˆط±ط© ظƒط´ظپ ط­ط³ط§ط¨ ط§ظ„ط¹ظ…ظٹظ„"){
  if(window.AlAboudNative?.shareImageToWhatsApp){
    const dataUrl=await globalBlobToDataUrl(blob);
    window.AlAboudNative.shareImageToWhatsApp(dataUrl,file.name);
    return true;
  }
  const canShareFiles=typeof navigator.canShare==="function"
    ? navigator.canShare({files:[file]})
    : Boolean(navigator.share);
  if(navigator.share && canShareFiles){
    await navigator.share({files:[file],title});
    return true;
  }
  return false;
}

function showImageShareOptionsGlobal(blob,file,title="طµظˆط±ط© ظƒط´ظپ ط­ط³ط§ط¨ ط§ظ„ط¹ظ…ظٹظ„"){
  const objectUrl=URL.createObjectURL(blob);
  const overlay=document.createElement("div");
  overlay.setAttribute("role","dialog");
  overlay.setAttribute("aria-modal","true");
  overlay.style.cssText="position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;padding:18px;direction:rtl";
  const card=document.createElement("div");
  card.style.cssText="width:min(520px,100%);max-height:94vh;overflow:auto;background:#0b1118;border:1px solid #9b7425;border-radius:22px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.55);color:#fff";
  const heading=document.createElement("h3");
  heading.textContent="ط®ظٹط§ط±ط§طھ ط¥ط±ط³ط§ظ„ ط§ظ„طµظˆط±ط©";
  heading.style.cssText="margin:0 0 12px;text-align:center;color:#f1c84b;font-size:22px";
  const preview=document.createElement("img");
  preview.src=objectUrl; preview.alt=title;
  preview.style.cssText="display:block;width:100%;max-height:55vh;object-fit:contain;background:#05080b;border-radius:14px;border:1px solid #2d3742";
  const actions=document.createElement("div");
  actions.style.cssText="display:grid;gap:10px;margin-top:14px";
  const makeButton=(label,background="#17202a")=>{
    const button=document.createElement("button"); button.type="button"; button.textContent=label;
    button.style.cssText=`width:100%;border:1px solid #9b7425;border-radius:13px;padding:14px 12px;background:${background};color:#fff;font-size:17px;font-weight:800;cursor:pointer`;
    return button;
  };
  const shareButton=makeButton("ًں“¤ ظ…ط´ط§ط±ظƒط© ط§ظ„طµظˆط±ط© ط¥ظ„ظ‰ ظˆط§طھط³ط§ط¨ ط£ظˆ ط£ظٹ طھط·ط¨ظٹظ‚","#176b3a");
  const downloadButton=makeButton("â¬‡ï¸ڈ ط­ظپط¸ ط§ظ„طµظˆط±ط© ظپظٹ ط§ظ„ظ‡ط§طھظپ");
  const openButton=makeButton("ًں–¼ï¸ڈ ظپطھط­ ط§ظ„طµظˆط±ط© ط¨ط§ظ„ط­ط¬ظ… ط§ظ„ظƒط§ظ…ظ„");
  const closeButton=makeButton("âœ– ط¥ط؛ظ„ط§ظ‚","#702b2b");
  const cleanup=()=>{ overlay.remove(); setTimeout(()=>URL.revokeObjectURL(objectUrl),1000); };
  shareButton.onclick=async()=>{
    try{
      if(await openGlobalAndroidShareSheet(blob,file,title))return;
      alert("ط§ظ„ظ…طھطµظپط­ ط§ظ„ط­ط§ظ„ظٹ ظ„ط§ ظٹط¯ط¹ظ… ط¥ط±ط³ط§ظ„ ظ…ظ„ظپ ط§ظ„طµظˆط±ط© ظ…ط¨ط§ط´ط±ط©. ط§ط³طھط®ط¯ظ… Chrome ط£ظˆ ط²ط± ط­ظپط¸ ط§ظ„طµظˆط±ط© ط«ظ… ط£ط±ط³ظ„ظ‡ط§ ظ…ظ† ظˆط§طھط³ط§ط¨.");
    }catch(error){ if(error?.name!=="AbortError")alert(error?.message||"طھط¹ط°ط± ظپطھط­ ط®ظٹط§ط±ط§طھ ط§ظ„ظ…ط´ط§ط±ظƒط©"); }
  };
  downloadButton.onclick=()=>{ const link=document.createElement("a"); link.href=objectUrl; link.download=file.name; document.body.appendChild(link); link.click(); link.remove(); };
  openButton.onclick=()=>window.open(objectUrl,"_blank");
  closeButton.onclick=cleanup;
  overlay.onclick=event=>{if(event.target===overlay)cleanup();};
  actions.append(shareButton,downloadButton,openButton,closeButton);
  card.append(heading,preview,actions); overlay.append(card); document.body.append(overlay);
}

function Customers({open}){
  const [list,setList]=useState([]);
  const [alerts,setAlerts]=useState({count:0,totalOverdue:0,rows:[]});
  const [search,setSearch]=useState("");
  const [error,setError]=useState("");

  const [customerForm,setCustomerForm]=useState({name:"",phone:"",email:"",oldBalance:""});
  const [editingCustomer,setEditingCustomer]=useState(null);

  const [transferForm,setTransferForm]=useState({
    customerId:"",
    currency:"USD",
    amount:"",
    costRate:"",
    finalRate:"",
    transferFee:"0",
    feeMethod:"ADD",
    paymentStatus:"UNPAID",
    transferDate:new Date().toISOString().slice(0,10),
    rateMode:"auto",
    rateSource:"exchange-rates",
    rateUpdatedAt:null
  });
  const [selectedRateMeta,setSelectedRateMeta]=useState(null);

  const [paymentForm,setPaymentForm]=useState({
    customerId:"",
    amount:"",
    paymentDate:new Date().toISOString().slice(0,10),
    method:"CASH",
    reference:""
  });

  const [activePanel,setActivePanel]=useState("");

  async function load(){
    setError("");
    try{
      const [customersResponse,alertsResponse]=await Promise.all([
        api.get("/customers"),
        api.get("/customer-alerts")
      ]);
      setList(Array.isArray(customersResponse.data)?customersResponse.data:[]);
      setAlerts(alertsResponse.data||{count:0,totalOverdue:0,rows:[]});
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± طھط­ظ…ظٹظ„ ط§ظ„ط¹ظ…ظ„ط§ط،");
    }
  }

  useEffect(()=>{load();},[]);

  useEffect(()=>{
    if(activePanel!=="transfer"||!transferForm.currency)return;

    if(transferForm.currency==="CAD"){
      setSelectedRateMeta({
        baseCurrency:"CAD",
        quoteCurrency:"CAD",
        buyRate:1,
        sellRate:1,
        createdAt:new Date().toISOString(),
        source:"base"
      });
      setTransferForm(current=>current.rateMode==="auto"
        ? {...current,costRate:"1",rateSource:"base",rateUpdatedAt:new Date().toISOString()}
        : current
      );
      return;
    }

    api.get("/exchange-rates")
      .then(response=>{
        const rates=Array.isArray(response.data)?response.data:[];
        const direct=rates.find(item=>
          String(item.baseCurrency||"").toUpperCase()===transferForm.currency &&
          String(item.quoteCurrency||"").toUpperCase()==="CAD"
        );

        if(!direct){
          setSelectedRateMeta(null);
          if(transferForm.rateMode==="auto"){
            setTransferForm(current=>({...current,costRate:"",rateUpdatedAt:null}));
          }
          return;
        }

        const automaticRate=Number(direct.buyRate||direct.sellRate||0);
        setSelectedRateMeta(direct);
        if(automaticRate>0&&transferForm.rateMode==="auto"){
          setTransferForm(current=>({
            ...current,
            costRate:String(automaticRate),
            rateSource:"exchange-rates",
            rateUpdatedAt:direct.createdAt||null
          }));
        }
      })
      .catch(()=>{
        setSelectedRateMeta(null);
        if(transferForm.rateMode==="auto"){
          setTransferForm(current=>({...current,costRate:"",rateUpdatedAt:null}));
        }
      });
  },[activePanel,transferForm.currency,transferForm.rateMode]);

  async function addCustomer(event){
    event.preventDefault();
    try{
      await api.post("/customers",customerForm);
      setCustomerForm({name:"",phone:"",email:"",oldBalance:""});
      setActivePanel("");
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± ط¥ط¶ط§ظپط© ط§ظ„ط¹ظ…ظٹظ„");
    }
  }

  async function saveCustomer(event){
    event.preventDefault();
    try{
      await api.patch(`/customers/${editingCustomer.id}`,editingCustomer);
      setEditingCustomer(null);
      setActivePanel("");
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± طھط¹ط¯ظٹظ„ ط§ظ„ط¹ظ…ظٹظ„");
    }
  }

  function prepareTransfer(customer){
    setTransferForm({
      customerId:customer.id,
      currency:"USD",
      amount:"",
      costRate:"",
      finalRate:"",
      transferFee:"0",
      feeMethod:"ADD",
      paymentStatus:"UNPAID",
      transferDate:new Date().toISOString().slice(0,10),
      rateMode:"auto",
      rateSource:"exchange-rates",
      rateUpdatedAt:null
    });
    setActivePanel("transfer");
    window.scrollTo({top:0,behavior:"smooth"});
  }

  async function addTransfer(event){
    event.preventDefault();
    try{
      const transactionResponse=await api.post("/transactions",{
        ...transferForm,
        amount:Number(transferForm.amount),
        costRate:Number(transferForm.costRate),
        finalRate:Number(transferForm.finalRate),
        transferFee:Number(transferForm.transferFee||0),
        rateSource:transferForm.rateMode==="auto"?"exchange-rates":"manual",
        rateUpdatedAt:transferForm.rateUpdatedAt||selectedRateMeta?.createdAt||null
      });

      const createdTransaction=transactionResponse.data;
      if(transferForm.paymentStatus==="PAID"&&createdTransaction?.id&&Number(createdTransaction.totalCustomerDue)>0){
        await api.post(`/transactions/${createdTransaction.id}/payments`,{
          amount:Number(createdTransaction.totalCustomerDue),
          paymentDate:transferForm.transferDate||new Date().toISOString().slice(0,10),
          method:"CASH",
          notes:"طھظ… طھط³ط¬ظٹظ„ ط§ظ„ط­ظˆط§ظ„ط© ظƒظ…ط¯ظپظˆط¹ط© ط¹ظ†ط¯ ط§ظ„ط¥ظ†ط´ط§ط،"
        });
      }

      setTransferForm({
        customerId:"",
        currency:"USD",
        amount:"",
        costRate:"",
        finalRate:"",
        transferFee:"0",
        feeMethod:"ADD",
        paymentStatus:"UNPAID",
        transferDate:new Date().toISOString().slice(0,10),
        rateMode:"auto",
        rateSource:"exchange-rates",
        rateUpdatedAt:null
      });
      setSelectedRateMeta(null);
      setActivePanel("");
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± ط¥ط¶ط§ظپط© ط§ظ„ط­ظˆط§ظ„ط©");
    }
  }

  function preparePayment(customer){
    setPaymentForm({
      customerId:customer.id,
      amount:"",
      paymentDate:new Date().toISOString().slice(0,10),
      method:"CASH",
      reference:""
    });
    setActivePanel("payment");
    window.scrollTo({top:0,behavior:"smooth"});
  }

  async function addPayment(event){
    event.preventDefault();
    try{
      if(!paymentForm.customerId)throw new Error("ط§ط®طھط± ط§ظ„ط¹ظ…ظٹظ„");
      await api.post(`/customers/${paymentForm.customerId}/payments`,{
        amount:Number(paymentForm.amount),
        paymentDate:paymentForm.paymentDate,
        method:paymentForm.method,
        reference:paymentForm.reference
      });
      setPaymentForm({
        customerId:"",
        amount:"",
        paymentDate:new Date().toISOString().slice(0,10),
        method:"CASH",
        reference:""
      });
      setActivePanel("");
      await load();
    }catch(error){
      setError(error.response?.data?.message||error.message||"طھط¹ط°ط± ط¥ط¶ط§ظپط© ط§ظ„ط¯ظپط¹ط©");
    }
  }

  function blobToDataUrl(blob){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||""));
      reader.onerror=()=>reject(new Error("طھط¹ط°ط± طھط¬ظ‡ظٹط² ط§ظ„طµظˆط±ط© ظ„ظ„ظ…ط´ط§ط±ظƒط©"));
      reader.readAsDataURL(blob);
    });
  }

  async function openAndroidShareSheet(blob,file,title="طµظˆط±ط© ظƒط´ظپ ط­ط³ط§ط¨ ط§ظ„ط¹ظ…ظٹظ„"){
    if(window.AlAboudNative?.shareImageToWhatsApp){
      const dataUrl=await blobToDataUrl(blob);
      window.AlAboudNative.shareImageToWhatsApp(dataUrl,file.name);
      return true;
    }

    const canShareFiles=typeof navigator.canShare==="function"
      ? navigator.canShare({files:[file]})
      : Boolean(navigator.share);

    if(navigator.share && canShareFiles){
      await navigator.share({files:[file],title});
      return true;
    }
    return false;
  }

  function showImageShareOptions(blob,file,title="طµظˆط±ط© ظƒط´ظپ ط­ط³ط§ط¨ ط§ظ„ط¹ظ…ظٹظ„"){
    const objectUrl=URL.createObjectURL(blob);
    const overlay=document.createElement("div");
    overlay.setAttribute("role","dialog");
    overlay.setAttribute("aria-modal","true");
    overlay.style.cssText="position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;padding:18px;direction:rtl";

    const card=document.createElement("div");
    card.style.cssText="width:min(520px,100%);max-height:94vh;overflow:auto;background:#0b1118;border:1px solid #9b7425;border-radius:22px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.55);color:#fff";

    const heading=document.createElement("h3");
    heading.textContent="ط®ظٹط§ط±ط§طھ ط¥ط±ط³ط§ظ„ ط§ظ„طµظˆط±ط©";
    heading.style.cssText="margin:0 0 12px;text-align:center;color:#f1c84b;font-size:22px";

    const preview=document.createElement("img");
    preview.src=objectUrl;
    preview.alt=title;
    preview.style.cssText="display:block;width:100%;max-height:55vh;object-fit:contain;background:#05080b;border-radius:14px;border:1px solid #2d3742";

    const actions=document.createElement("div");
    actions.style.cssText="display:grid;gap:10px;margin-top:14px";

    const makeButton=(label,background="#17202a")=>{
      const button=document.createElement("button");
      button.type="button";
      button.textContent=label;
      button.style.cssText=`width:100%;border:1px solid #9b7425;border-radius:13px;padding:14px 12px;background:${background};color:#fff;font-size:17px;font-weight:800;cursor:pointer`;
      return button;
    };

    const shareButton=makeButton("ًں“¤ ظ…ط´ط§ط±ظƒط© ط§ظ„طµظˆط±ط© ط¥ظ„ظ‰ ظˆط§طھط³ط§ط¨ ط£ظˆ ط£ظٹ طھط·ط¨ظٹظ‚","#176b3a");
    const downloadButton=makeButton("â¬‡ï¸ڈ ط­ظپط¸ ط§ظ„طµظˆط±ط© ظپظٹ ط§ظ„ظ‡ط§طھظپ");
    const openButton=makeButton("ًں–¼ï¸ڈ ظپطھط­ ط§ظ„طµظˆط±ط© ط¨ط§ظ„ط­ط¬ظ… ط§ظ„ظƒط§ظ…ظ„");
    const closeButton=makeButton("âœ– ط¥ط؛ظ„ط§ظ‚","#702b2b");

    const cleanup=()=>{
      overlay.remove();
      setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
    };

    shareButton.onclick=async()=>{
      try{
        if(await openAndroidShareSheet(blob,file,title))return;
        alert("ط§ظ„ظ…طھطµظپط­ ط§ظ„ط­ط§ظ„ظٹ ظ„ط§ ظٹط¯ط¹ظ… ط¥ط±ط³ط§ظ„ ظ…ظ„ظپ ط§ظ„طµظˆط±ط© ظ…ط¨ط§ط´ط±ط©. ط¬ط±ظ‘ط¨ ظپطھط­ ط§ظ„ظ…ظˆظ‚ط¹ ظپظٹ Chrome ط£ظˆ ط«ط¨ظ‘طھ ط§ظ„طھط·ط¨ظٹظ‚ ط¹ظ„ظ‰ ط§ظ„ط´ط§ط´ط© ط§ظ„ط±ط¦ظٹط³ظٹط©طŒ ط£ظˆ ط§ط³طھط®ط¯ظ… ط²ط± ط­ظپط¸ ط§ظ„طµظˆط±ط© ط«ظ… ط£ط±ط³ظ„ظ‡ط§ ظ…ظ† ظˆط§طھط³ط§ط¨.");
      }catch(error){
        if(error?.name!=="AbortError")alert(error?.message||"طھط¹ط°ط± ظپطھط­ ط®ظٹط§ط±ط§طھ ط§ظ„ظ…ط´ط§ط±ظƒط©");
      }
    };

    downloadButton.onclick=()=>{
      const link=document.createElement("a");
      link.href=objectUrl;
      link.download=file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
    };

    openButton.onclick=()=>window.open(objectUrl,"_blank");
    closeButton.onclick=cleanup;
    overlay.onclick=event=>{if(event.target===overlay)cleanup();};

    actions.append(shareButton,downloadButton,openButton,closeButton);
    card.append(heading,preview,actions);
    overlay.append(card);
    document.body.append(overlay);
  }

  function createStatementImage(data,customer){
    const rows=Array.isArray(data.transactions)?data.transactions:[];
    const width=1080,rowHeight=82;
    const height=Math.max(1350,390+rows.length*rowHeight+440);
    const canvas=document.createElement("canvas");
    canvas.width=720;canvas.height=Math.ceil(height*2/3);
    const ctx=canvas.getContext("2d");
      ctx.scale(2/3,2/3);
    const total=Number(data.totals?.formulaResultCad||0);
    const paid=Number(data.totals?.paid||0);
    const finalBalance=Math.max(total-paid,0);
    const txt=(v,x,y,size,color="#f4f4f5",align="center",weight="700")=>{
      ctx.fillStyle=color;ctx.font=`${weight} ${size}px Arial, sans-serif`;
      ctx.textAlign=align;ctx.textBaseline="middle";ctx.direction="rtl";ctx.fillText(String(v),x,y);
    };
    ctx.fillStyle="#061018";ctx.fillRect(0,0,width,height);
    const g=ctx.createLinearGradient(0,0,width,height);
    g.addColorStop(0,"#15232f");g.addColorStop(1,"#08131c");
    ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(28,28,width-56,height-56,38);ctx.fill();
    ctx.strokeStyle="#47545e";ctx.lineWidth=2;ctx.stroke();
    txt(data.company?.name||"ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ظ„ظ„طھط¬ط§ط±ط©",width/2,90,56);
    txt("ظƒط´ظپ ط­ط³ط§ط¨ ط§ظ„ط¹ظ…ظٹظ„",width/2,165,48,"#d8a33f");
    txt(customer.name,width/2,235,41);
    ctx.strokeStyle="#69747c";ctx.beginPath();ctx.moveTo(55,292);ctx.lineTo(width-55,292);ctx.stroke();
    let y=345;
    rows.forEach((item,index)=>{
      const amount=Number(item.usdAmount||item.amount||0).toFixed(2).replace(/\.00$/,"");
      const rate=Number(item.customerRate||item.finalRate||0).toFixed(4).replace(/0+$/,"").replace(/\.$/,"");
      ctx.direction="ltr";ctx.textAlign="left";ctx.fillStyle="#f4f4f5";
      ctx.font='700 39px Arial, sans-serif';
      ctx.fillText(`${index+1}_  ${amount}  ًں‡؛ًں‡¸  أ—  ${rate}  =  ${money(item.formulaResultCad)}  ًں‡¨ًں‡¦`,65,y);
      ctx.strokeStyle="#2b3a45";ctx.beginPath();ctx.moveTo(55,y+38);ctx.lineTo(width-55,y+38);ctx.stroke();
      y+=rowHeight;
    });
    y+=25;ctx.setLineDash([12,10]);ctx.strokeStyle="#65717a";ctx.beginPath();ctx.moveTo(55,y);ctx.lineTo(width-55,y);ctx.stroke();ctx.setLineDash([]);
    y+=75;txt("ًں’µ  ط§ظ„ظ…ط¬ظ…ظˆط¹ ط§ظ„ط¥ط¬ظ…ط§ظ„ظٹ",90,y,38,"#f4f4f5","left");txt(`${money(total)}  ًں‡¨ًں‡¦`,width-75,y,43,"#f4f4f5","right","800");
    y+=88;txt("ًں‘›  ط§ظ„ط¯ظپط¹ط§طھ",90,y,38,"#f4f4f5","left");txt(`${money(paid)}  ًں‡¨ًں‡¦`,width-75,y,43,"#ef4444","right","800");
    y+=65;ctx.setLineDash([12,10]);ctx.strokeStyle="#65717a";ctx.beginPath();ctx.moveTo(55,y);ctx.lineTo(width-55,y);ctx.stroke();ctx.setLineDash([]);
    y+=88;txt("ًں§®  ط§ظ„ظ…ط¬ظ…ظˆط¹ ط§ظ„ظ†ظ‡ط§ط¦ظٹ",90,y,42,"#f4f4f5","left","800");txt(`${money(finalBalance)}  ًں‡¨ًں‡¦`,width-75,y,49,"#63c443","right","900");
    y+=90;ctx.strokeStyle="#69747c";ctx.beginPath();ctx.moveTo(55,y);ctx.lineTo(width-55,y);ctx.stroke();
    y+=62;const d=new Date();txt(`ًں“… ط§ظ„طھط§ط±ظٹط®: ${d.toLocaleDateString("en-CA")}`,65,y,28,"#aeb7bf","left","500");txt(`ًں•ک ط§ظ„ظˆظ‚طھ: ${d.toLocaleTimeString("ar-CA",{hour:"2-digit",minute:"2-digit"})}`,width-65,y,28,"#aeb7bf","right","500");
    y+=65;txt("ط´ظƒط±ط§ظ‹ ظ„طھط¹ط§ظ…ظ„ظƒظ… ظ…ط¹ظ†ط§",width/2,y,34,"#d8a33f");
    return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("طھط¹ط°ط± ط¥ظ†ط´ط§ط، ط§ظ„طµظˆط±ط©")),"image/png",0.96));
  }

  async function shareStatementImage(customer){
    try{
      const {data}=await api.get(`/customers/${customer.id}/statement`);
      const blob=await createStatementImage(data,customer);
      const safe=String(customer.name||"customer").replace(/[\\/:*?"<>|]+/g,"-");
      const file=new File([blob],`ظƒط´ظپ-ط­ط³ط§ط¨-${safe}.png`,{type:"image/png"});
      showImageShareOptions(blob,file,"ظƒط´ظپ ط­ط³ط§ط¨ ط§ظ„ط¹ظ…ظٹظ„");
    }catch(e){
      if(e?.name==="AbortError")return;
      setError(e.response?.data?.message||e.message||"طھط¹ط°ط± ط¥ظ†ط´ط§ط، طµظˆط±ط© ظƒط´ظپ ط§ظ„ط­ط³ط§ط¨");
    }
  }

  async function whatsappFinalBalance(customer, urgent=false){
    const phone=String(customer.phone||"").replace(/\D/g,"");
    if(!phone){
      setError("ظ„ط§ ظٹظˆط¬ط¯ ط±ظ‚ظ… ظˆط§طھط³ط§ط¨ ظ…ط­ظپظˆط¸ ظ„ظ‡ط°ط§ ط§ظ„ط¹ظ…ظٹظ„");
      return;
    }

    if(urgent){
      const urgentMessage=`ط§ظ„ط³ظ„ط§ظ… ط¹ظ„ظٹظƒظ… ${customer.name}طŒ
ظ†ط°ظƒظ‘ط±ظƒظ… ط¨ط¶ط±ظˆط±ط© طھط³ط¯ظٹط¯ ط§ظ„ط±طµظٹط¯ ط§ظ„ظ…ط³طھط­ظ‚ ظˆظ‚ط¯ط±ظ‡ ${cad(customer.finalBalance)}.
ط¹ط¯ط¯ ط£ظٹط§ظ… ط§ظ„طھط£ط®ظٹط±: ${customer.overdueDays} ظٹظˆظ….
ظٹط±ط¬ظ‰ ط§ظ„طھظˆط§طµظ„ ظ…ط¹ظ†ط§ ظ„طھط³ظˆظٹط© ط§ظ„ط­ط³ط§ط¨.`;
      openRegularWhatsApp(phone,urgentMessage);
      return;
    }

    try{
      const {data}=await api.get(`/customers/${customer.id}/statement`);
      const lines=(Array.isArray(data.transactions)?data.transactions:[]).map((item,index)=>{
        const amount=Number(item.usdAmount||0).toFixed(2).replace(/\.00$/,"");
        const rate=Number(item.customerRate||0).toFixed(4).replace(/0+$/,"").replace(/\.$/,"");
        return `${index+1}_ ${amount} ًں‡؛ًں‡¸ أ— ${rate} = ${money(item.formulaResultCad)} ًں‡¨ًں‡¦`;
      });

      const statementTotal=Number(data.totals?.formulaResultCad||0);
      const statementPaid=Number(data.totals?.paid||0);
      const finalStatementBalance=Math.max(statementTotal-statementPaid,0);

      const message=[
        data.company?.name||"ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ط§ظ„طھط¬ط§ط±ظٹط©",
        "",
        "ظƒط´ظپ ط­ط³ط§ط¨ ط§ظ„ط¹ظ…ظٹظ„",
        customer.name,
        "",
        ...(oldBalance>0?[`ط§ظ„ط­ط³ط§ط¨ ط§ظ„ظ‚ط¯ظٹظ…: ${money(oldBalance)} ًں‡¨ًں‡¦`,""]:[]),
        ...lines,
        "",
        "--------------------",
        `ط§ظ„ط¯ظپط¹ط§طھ: ${money(statementPaid)} ًں‡¨ًں‡¦`,
        `ط§ظ„ظ…ط¬ظ…ظˆط¹ ط§ظ„ظ†ظ‡ط§ط¦ظٹ: ${money(finalStatementBalance)} ًں‡¨ًں‡¦`
      ].join("\n");

      openRegularWhatsApp(phone,message);
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± طھط¬ظ‡ظٹط² ظƒط´ظپ ط§ظ„ط­ط³ط§ط¨ ظ„ظ„ظˆط§طھط³ط§ط¨");
    }
  }

  const filtered=list.filter(customer=>
    `${customer.name} ${customer.phone||""}`.toLowerCase().includes(search.toLowerCase())
  );

  const customerActionFocus=activePanel==="transfer"||activePanel==="payment";

  return <>
    <h2>ظ‚ط§ط¦ظ…ط© ط§ظ„ط¹ظ…ظ„ط§ط،</h2>
    {error&&<div className="card customer-error">{error}</div>}

    {!customerActionFocus&&<>
    <div className="stats customer-stats-final">
      <div className="card customer-stat-row">
        <div className="customer-stat-icon">ًں‘¥</div>
        <span className="customer-stat-label">ط¹ط¯ط¯ ط§ظ„ط¹ظ…ظ„ط§ط،</span>
        <strong className="customer-stat-value">{list.length}</strong>
      </div>
      <div className="card customer-stat-row">
        <div className="customer-stat-icon">ًں‘›</div>
        <span className="customer-stat-label">ظ…ط¬ظ…ظˆط¹ ط§ظ„ط­ط³ط§ط¨ط§طھ ط§ظ„ظƒظ„ظٹ</span>
        <strong className="customer-stat-value">{cad(list.reduce((sum,item)=>sum+Number(item.totalTransactions||0),0))}</strong>
      </div>
      <div className="card customer-stat-row">
        <div className="customer-stat-icon">ًں«´</div>
        <span className="customer-stat-label">ظ…ط¬ظ…ظˆط¹ ط§ظ„ظ…ط¯ظپظˆط¹</span>
        <strong className="customer-stat-value">{cad(list.reduce((sum,item)=>sum+Number(item.totalPaid||0),0))}</strong>
      </div>
      <div className="card final customer-stat-row">
        <div className="customer-stat-icon">ًں§®</div>
        <span className="customer-stat-label">ط§ظ„ظ…ط¬ظ…ظˆط¹ ط§ظ„ظ†ظ‡ط§ط¦ظٹ (CAD) ط§ظ„ظ…طھط¨ظ‚ظٹ</span>
        <strong className="customer-stat-value">{cad(list.reduce((sum,item)=>sum+Number(item.finalBalance||0),0))}</strong>
      </div>
      <div className="card overdue-card customer-stat-row">
        <div className="customer-stat-icon">ًں•ک</div>
        <span className="customer-stat-label">ط§ظ„ظ…طھط£ط®ط±ظˆظ† ط£ظƒط«ط± ظ…ظ† ط£ط³ط¨ظˆط¹</span>
        <strong className="customer-stat-value">{alerts.count}</strong>
      </div>
    </div>

    <div className="customer-toolbar card">
      <button onClick={()=>{setActivePanel("newCustomer");setEditingCustomer(null)}}>ط¥ط¶ط§ظپط© ط¹ظ…ظٹظ„</button>
      <button onClick={()=>setActivePanel(activePanel==="transfer"?"":"transfer")}>ط¥ط¶ط§ظپط© ط­ظˆط§ظ„ط©</button>
      <button onClick={()=>setActivePanel(activePanel==="payment"?"":"payment")}>ط¥ط¶ط§ظپط© ط¯ظپط¹ط©</button>
    </div>
    </>}


    {activePanel==="newCustomer"&&
      <form className="card form edit-panel" onSubmit={addCustomer}>
        <h3>ط¥ط¶ط§ظپط© ط¹ظ…ظٹظ„ ط¬ط¯ظٹط¯</h3>
        <input value={customerForm.name} onChange={e=>setCustomerForm({...customerForm,name:e.target.value})} placeholder="ط§ط³ظ… ط§ظ„ط¹ظ…ظٹظ„" required/>
        <input value={customerForm.phone} onChange={e=>setCustomerForm({...customerForm,phone:e.target.value})} placeholder="ط±ظ‚ظ… ط§ظ„ظ‡ط§طھظپ / ظˆط§طھط³ط§ط¨"/>
        <input type="email" value={customerForm.email} onChange={e=>setCustomerForm({...customerForm,email:e.target.value})} placeholder="ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ"/>
        <input type="number" min="0" step=".01" value={customerForm.oldBalance} onChange={e=>setCustomerForm({...customerForm,oldBalance:e.target.value})} placeholder="ط§ظ„ط­ط³ط§ط¨ ط§ظ„ظ‚ط¯ظٹظ… (CAD)"/>
        <button>ط­ظپط¸ ط§ظ„ط¹ظ…ظٹظ„</button>
        <button type="button" onClick={()=>setActivePanel("")}>ط¥ظ„ط؛ط§ط،</button>
      </form>
    }

    {editingCustomer&&
      <form className="card form edit-panel" onSubmit={saveCustomer}>
        <h3>طھط¹ط¯ظٹظ„ ط¨ظٹط§ظ†ط§طھ ط§ظ„ط¹ظ…ظٹظ„</h3>
        <input value={editingCustomer.name||""} onChange={e=>setEditingCustomer({...editingCustomer,name:e.target.value})} placeholder="ط§ط³ظ… ط§ظ„ط¹ظ…ظٹظ„" required/>
        <input value={editingCustomer.phone||""} onChange={e=>setEditingCustomer({...editingCustomer,phone:e.target.value})} placeholder="ط±ظ‚ظ… ط§ظ„ظ‡ط§طھظپ / ظˆط§طھط³ط§ط¨"/>
        <input type="email" value={editingCustomer.email||""} onChange={e=>setEditingCustomer({...editingCustomer,email:e.target.value})} placeholder="ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ"/>
        <input type="number" min="0" step=".01" value={editingCustomer.oldBalance||""} onChange={e=>setEditingCustomer({...editingCustomer,oldBalance:e.target.value})} placeholder="ط§ظ„ط­ط³ط§ط¨ ط§ظ„ظ‚ط¯ظٹظ… (CAD)"/>
        <button>ط­ظپط¸ ط§ظ„طھط¹ط¯ظٹظ„</button>
        <button type="button" onClick={()=>setEditingCustomer(null)}>ط¥ظ„ط؛ط§ط،</button>
      </form>
    }

    {activePanel==="transfer"&&
      <div className="customer-action-focus-page">
        <div className="customer-action-focus-header">
          <div><span>â‡„</span><h2>ط¥ط¶ط§ظپط© ط­ظˆط§ظ„ط©</h2></div>
          <button type="button" onClick={()=>setActivePanel("")}>âœ• ط¥ط؛ظ„ط§ظ‚</button>
        </div>
      <form className="card form edit-panel customer-action-focus-form" onSubmit={addTransfer}>
        <h3>ط¥ط¶ط§ظپط© ط­ظˆط§ظ„ط©</h3>
        <select value={transferForm.customerId} onChange={e=>setTransferForm({...transferForm,customerId:e.target.value})} required>
          <option value="">ط§ط®طھط± ط§ظ„ط¹ظ…ظٹظ„</option>
          {list.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}
        </select>
        <input type="date" value={transferForm.transferDate} onChange={e=>setTransferForm({...transferForm,transferDate:e.target.value})}/>
        <label className="currency-field">
          <span className="currency-field-title">ط¹ظ…ظ„ط© ط§ظ„ط­ظˆط§ظ„ط©</span>
          <span className="currency-badge">{transferForm.currency}</span>
          <select value={transferForm.currency} onChange={e=>setTransferForm({...transferForm,currency:e.target.value,costRate:"",finalRate:""})}>
            {["USD","EUR","SYP","AED","GBP","CAD"].map(code=><option key={code} value={code}>{code}</option>)}
          </select>
          <small>ط§ط®طھط± ط§ظ„ط¹ظ…ظ„ط© ط§ظ„ظ…ط±ط³ظ„ط©طŒ ظˆط³ظٹطھظ… ط¬ظ„ط¨ ط³ط¹ط± ط§ظ„طھظƒظ„ظپط© ظ…ظ‚ط§ط¨ظ„ CAD طھظ„ظ‚ط§ط¦ظٹظ‹ط§</small>
        </label>
        <label className="currency-field">
          <span className="currency-field-title">ظ…ط¨ظ„ط؛ ط§ظ„ط­ظˆط§ظ„ط©</span>
          <span className="currency-badge">{transferForm.currency}</span>
          <input type="number" inputMode="decimal" min=".01" step=".01" value={transferForm.amount} onChange={e=>setTransferForm({...transferForm,amount:e.target.value})} placeholder="0.00" required/>
          <small>ط§ظ„ظ…ط¨ظ„ط؛ ط¨ط¹ظ…ظ„ط© {transferForm.currency}</small>
        </label>
        <label className="currency-field">
          <span className="currency-field-title">ط³ط¹ط± ط§ظ„طھظƒظ„ظپط© ظ…ظ‚ط§ط¨ظ„ CAD</span>
          <span className="currency-badge cad">CAD</span>
          <div className="rate-mode-switch">
            <button type="button" className={transferForm.rateMode==="auto"?"active":""} onClick={()=>setTransferForm({...transferForm,rateMode:"auto"})}>ط§ظ„ط³ط¹ط± ط§ظ„ط¢ظ„ظٹ</button>
            <button type="button" className={transferForm.rateMode==="manual"?"active":""} onClick={()=>setTransferForm({...transferForm,rateMode:"manual"})}>ط³ط¹ط± ظٹط¯ظˆظٹ</button>
          </div>
          <input type="number" inputMode="decimal" min=".0000001" step=".0000001" value={transferForm.costRate} onChange={e=>setTransferForm({...transferForm,costRate:e.target.value,rateMode:"manual"})} placeholder="0.0000" required readOnly={transferForm.rateMode==="auto"}/>
          <small>{(selectedRateMeta?.createdAt||selectedRateMeta?.updatedAt)?`ط¢ط®ط± طھط­ط¯ظٹط«: ${new Date(selectedRateMeta.createdAt||selectedRateMeta.updatedAt).toLocaleString("ar-CA")}`:transferForm.rateMode==="manual"?"ظٹظڈط³طھط®ط¯ظ… ظ‡ط°ط§ ط§ظ„ط³ط¹ط± ظ„ظ‡ط°ظ‡ ط§ظ„ط­ظˆط§ظ„ط© ظپظ‚ط·":"ظ„ط§ ظٹظˆط¬ط¯ ط³ط¹ط± ط¢ظ„ظٹ ظ„ظ‡ط°ظ‡ ط§ظ„ط¹ظ…ظ„ط©ط› ط§ط®طھط± ط³ط¹ط± ظٹط¯ظˆظٹ"}</small>
        </label>
        <label className="currency-field">
          <span className="currency-field-title">ط³ط¹ط± ط§ظ„طھط­ظˆظٹظ„ ظ„ظ„ط¹ظ…ظٹظ„</span>
          <span className="currency-badge cad">CAD</span>
          <input type="number" inputMode="decimal" min=".0001" step=".0001" value={transferForm.finalRate} onChange={e=>setTransferForm({...transferForm,finalRate:e.target.value})} placeholder="0.0000" required/>
          <small>ط§ظ„ط³ط¹ط± ط§ظ„ط°ظٹ ظٹظڈط­ط§ط³ط¨ ط¹ظ„ظٹظ‡ ط§ظ„ط¹ظ…ظٹظ„ ظ…ظ‚ط§ط¨ظ„ ظƒظ„ ظˆط­ط¯ط© ظ…ظ† ط¹ظ…ظ„ط© ط§ظ„ط­ظˆط§ظ„ط©</small>
        </label>
        <div className="transfer-calculation-grid">
          <div className="transfer-total-preview">
            <span>ط§ظ„ظ…ط¬ظ…ظˆط¹ ط§ظ„ظ†ظ‡ط§ط¦ظٹ (CAD) ظ„ظ„ط¹ظ…ظٹظ„</span>
            <strong>{((Number(transferForm.amount)||0)*(Number(transferForm.finalRate)||0)+(Number(transferForm.transferFee)||0)).toFixed(2)} CAD</strong>
          </div>
          <div className="transfer-profit-preview">
            <span>ط±ط¨ط­ ط§ظ„ط­ظˆط§ظ„ط©</span>
            <strong>{((Number(transferForm.amount)||0)*((Number(transferForm.finalRate)||0)-(Number(transferForm.costRate)||0))+(Number(transferForm.transferFee)||0)).toFixed(2)} CAD</strong>
          </div>
        </div>
        <label className="currency-field">
          <span className="currency-field-title">ط£ط¬ظˆط± ط§ظ„ط­ظˆط§ظ„ط©</span>
          <span className="currency-badge cad">CAD</span>
          <input type="number" inputMode="decimal" min="0" step=".01" value={transferForm.transferFee} onChange={e=>setTransferForm({...transferForm,transferFee:e.target.value})} placeholder="0.00"/>
        </label>
        <div className="transfer-payment-status">
          <div className="transfer-payment-status-title">ط­ط§ظ„ط© ط§ظ„ط­ظˆط§ظ„ط©</div>
          <div className="transfer-payment-status-buttons">
            <button
              type="button"
              className={`transfer-status-button paid ${transferForm.paymentStatus==="PAID"?"active":""}`}
              onClick={()=>setTransferForm({...transferForm,paymentStatus:"PAID"})}
            >
              <span className="transfer-status-icon">âœ“</span>
              <span>ظ…ط¯ظپظˆط¹</span>
            </button>
            <button
              type="button"
              className={`transfer-status-button unpaid ${transferForm.paymentStatus==="UNPAID"?"active":""}`}
              onClick={()=>setTransferForm({...transferForm,paymentStatus:"UNPAID"})}
            >
              <span className="transfer-status-icon">âˆ’</span>
              <span>ط؛ظٹط± ظ…ط¯ظپظˆط¹</span>
            </button>
          </div>
        </div>
        <button className="save-transfer-button">ط­ظپط¸ ط§ظ„ط­ظˆط§ظ„ط©</button>
        <button type="button" onClick={()=>setActivePanel("")}>ط¥ظ„ط؛ط§ط،</button>
      </form>
      </div>
    }

    {activePanel==="payment"&&
      <div className="customer-action-focus-page">
        <div className="customer-action-focus-header">
          <div><span>ًں’µ</span><h2>ط¥ط¶ط§ظپط© ط¯ظپط¹ط©</h2></div>
          <button type="button" onClick={()=>setActivePanel("")}>âœ• ط¥ط؛ظ„ط§ظ‚</button>
        </div>
      <form className="card form edit-panel customer-action-focus-form" onSubmit={addPayment}>
        <h3>ط¥ط¶ط§ظپط© ط¯ظپط¹ط©</h3>
        <p className="payment-auto-note">طھظڈط®طµظ… ط§ظ„ط¯ظپط¹ط© طھظ„ظ‚ط§ط¦ظٹظ‹ط§ ظ…ظ† ط£ظ‚ط¯ظ… ط§ظ„ط­ظˆط§ظ„ط§طھ ط؛ظٹط± ط§ظ„ظ…ط¯ظپظˆط¹ط© ظ„ظ„ط¹ظ…ظٹظ„.</p>
        <select value={paymentForm.customerId} onChange={e=>setPaymentForm({...paymentForm,customerId:e.target.value})} required>
          <option value="">ط§ط®طھط± ط§ظ„ط¹ظ…ظٹظ„</option>
          {list.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}
        </select>
        <input type="number" min=".01" step=".01" value={paymentForm.amount} onChange={e=>setPaymentForm({...paymentForm,amount:e.target.value})} placeholder="ظ…ط¨ظ„ط؛ ط§ظ„ط¯ظپط¹ط©" required/>
        <input type="date" value={paymentForm.paymentDate} onChange={e=>setPaymentForm({...paymentForm,paymentDate:e.target.value})}/>
        <select value={paymentForm.method} onChange={e=>setPaymentForm({...paymentForm,method:e.target.value})}>
          <option value="CASH">ظ†ظ‚ط¯ظٹ</option>
          <option value="BANK">ط¨ظ†ظƒ</option>
          <option value="TRANSFER">طھط­ظˆظٹظ„</option>
          <option value="CARD">ط¨ط·ط§ظ‚ط©</option>
        </select>
        <input value={paymentForm.reference} onChange={e=>setPaymentForm({...paymentForm,reference:e.target.value})} placeholder="ط±ظ‚ظ… ط§ظ„ظ…ط±ط¬ط¹"/>
        <button>ط­ظپط¸ ط§ظ„ط¯ظپط¹ط©</button>
        <button type="button" onClick={()=>setActivePanel("")}>ط¥ظ„ط؛ط§ط،</button>
      </form>
      </div>
    }

    {!customerActionFocus&&<>
    {alerts.count>0&&
      <div className="card overdue-panel">
        <h3>طھظ†ط¨ظٹظ‡ط§طھ ط§ظ„ط¹ظ…ظ„ط§ط، ط§ظ„ظ…طھط£ط®ط±ظٹظ†</h3>
        {alerts.rows.slice(0,8).map(customer=><div className="overdue-row" key={customer.id}>
          <span><strong>{customer.name}</strong> â€” ظ…طھط£ط®ط± {customer.overdueDays} ظٹظˆظ… â€” ط§ظ„ط±طµظٹط¯ {cad(customer.finalBalance)}</span>
          <button className="danger-button" onClick={()=>whatsappFinalBalance(customer,true)}>طھظ†ط¨ظٹظ‡ ظˆط§طھط³ط§ط¨</button>
        </div>)}
      </div>
    }

    <input className="card customer-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="ط¨ط­ط« ط¨ط§ط³ظ… ط§ظ„ط¹ظ…ظٹظ„ ط£ظˆ ط±ظ‚ظ… ط§ظ„ظ‡ط§طھظپ"/>

    <div className="customer-cards customer-list-simple">
      {filtered.length?filtered.map(customer=><button
        type="button"
        className={`customer-simple-row ${customer.overdue?"is-overdue":customer.finalBalance>0?"has-balance":"is-paid"}`}
        key={customer.id}
        onClick={()=>open(customer.id)}
      >
        <div className="customer-simple-main customer-name-only">
          <strong>{customer.name}</strong>
        </div>
      </button>):<div className="card">ظ„ط§ طھظˆط¬ط¯ ظ†طھط§ط¦ط¬.</div>}
    </div>
    </>}
  </>;
}

function OverdueCustomers({openCustomer,onStatement,navigateCustomers}){
  const [data,setData]=useState({
    count:0,totalOverdue:0,largestOverdueBalance:0,largestOverdueCustomer:null,
    oldestCustomer:null,oldestDays:0,expectedToday:0,rows:[]
  });
  const [search,setSearch]=useState("");
  const [days,setDays]=useState("7");
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [drafts,setDrafts]=useState({});

  async function load(){
    setError("");
    try{
      const response=await api.get("/customer-alerts");
      setData(response.data||{rows:[]});
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± طھط­ظ…ظٹظ„ ط§ظ„ط¹ظ…ظ„ط§ط، ط§ظ„ظ…طھط£ط®ط±ظٹظ†");
    }
  }

  useEffect(()=>{load();},[]);



  function updateDraft(customerId,patch){
    setDrafts(current=>({
      ...current,
      [customerId]:{promiseDate:"",expectedAmount:"",notes:"",messageType:"gentle",...(current[customerId]||{}),...patch}
    }));
  }

  function whatsappText(customer,type){
    const templates={
      gentle:[
        `ط§ظ„ط³ظ„ط§ظ… ط¹ظ„ظٹظƒظ… ${customer.name}طŒ`,
        `ظ†ط°ظƒظ‘ط±ظƒظ… ط¨ظ„ط·ظپ ط¨ظˆط¬ظˆط¯ ط±طµظٹط¯ ظ…ط³طھط­ظ‚ ظ‚ط¯ط±ظ‡ ${cad(customer.finalBalance)} CAD.`,
        `ظ…ط¯ط© ط§ظ„طھط£ط®ظٹط±: ${customer.overdueDays} ظٹظˆظ….`,
        `ظ†ط±ط¬ظˆ ط§ظ„طھظƒط±ظ… ط¨ط§ظ„ط³ط¯ط§ط¯ ظپظٹ ط§ظ„ظˆظ‚طھ ط§ظ„ظ…ظ†ط§ط³ط¨.`,
        `ط´ظƒط±ط§ظ‹ ظ„طھط¹ط§ظ…ظ„ظƒظ… ظ…ط¹ ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ظ„ظ„طھط¬ط§ط±ط©.`
      ],
      formal:[
        `ط§ظ„ط³ظٹط¯/ط§ظ„ط³ظٹط¯ط© ${customer.name} ط§ظ„ظ…ط­طھط±ظ…/ط©طŒ`,
        `ظ†ظپظٹط¯ظƒظ… ط¨ظˆط¬ظˆط¯ ط±طµظٹط¯ ظ…ط³طھط­ظ‚ ط¹ظ„ظ‰ ط­ط³ط§ط¨ظƒظ… ط¨ظ‚ظٹظ…ط© ${cad(customer.finalBalance)} CAD.`,
        `ظˆظ‚ط¯ طھط¬ط§ظˆط²طھ ظ…ط¯ط© ط§ظ„طھط£ط®ظٹط± ${customer.overdueDays} ظٹظˆظ…ظ‹ط§.`,
        `ظٹط±ط¬ظ‰ طھط³ظˆظٹط© ط§ظ„ط±طµظٹط¯ ط£ظˆ ط§ظ„طھظˆط§طµظ„ ظ…ط¹ظ†ط§ ظ„طھط­ط¯ظٹط¯ ظ…ظˆط¹ط¯ ط§ظ„ط¯ظپط¹.`,
        `ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ظ„ظ„طھط¬ط§ط±ط©.`
      ],
      statement:[
        `ط§ظ„ط³ظ„ط§ظ… ط¹ظ„ظٹظƒظ… ${customer.name}طŒ`,
        `ظ…ظ„ط®طµ ط­ط³ط§ط¨ظƒظ… ط§ظ„ط­ط§ظ„ظٹ:`,
        `ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط­ط³ط§ط¨: ${cad(customer.totalTransactions)} CAD`,
        `ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ظ…ط¯ظپظˆط¹: ${cad(customer.totalPaid)} CAD`,
        `ط§ظ„ط±طµظٹط¯ ط§ظ„ظ…طھط¨ظ‚ظٹ: ${cad(customer.finalBalance)} CAD`,
        `ظٹظ…ظƒظ†ظ†ط§ طھط²ظˆظٹط¯ظƒظ… ط¨ظƒط´ظپ ط§ظ„ط­ط³ط§ط¨ ط§ظ„ظƒط§ظ…ظ„ ط¹ظ†ط¯ ط§ظ„ط·ظ„ط¨.`
      ]
    };
    return (templates[type]||templates.gentle).join("\n");
  }

  async function sendWhatsapp(customer){
    const phone=String(customer.phone||"").replace(/\D/g,"");
    if(!phone){
      setError(`ظ„ط§ ظٹظˆط¬ط¯ ط±ظ‚ظ… ظˆط§طھط³ط§ط¨ ظ…ط­ظپظˆط¸ ظ„ظ„ط¹ظ…ظٹظ„ ${customer.name}`);
      return;
    }
    const type=drafts[customer.id]?.messageType||"gentle";
    openRegularWhatsApp(phone,whatsappText(customer,type));
    try{
      await api.post("/notification-actions",{
        customerId:customer.id,
        action:"WHATSAPP_OPENED",
        notes:`طھظ… ظپطھط­ ط±ط³ط§ظ„ط© ظˆط§طھط³ط§ط¨ ظ…ظ† ط§ظ„ظ†ظˆط¹ ${type}`
      });
      load();
    }catch{}
  }

  async function saveAction(customer,action){
    const draft=drafts[customer.id]||{};
    setError("");
    setSuccess("");
    try{
      await api.post("/notification-actions",{
        customerId:customer.id,
        action,
        notes:draft.notes||"",
        promiseDate:draft.promiseDate||null,
        expectedAmount:draft.expectedAmount||null
      });
      setSuccess(action==="PROMISE_TO_PAY"?"طھظ… ط­ظپط¸ ظˆط¹ط¯ ط§ظ„ط¯ظپط¹":"طھظ… طھط³ط¬ظٹظ„ ط§ظ„طھظˆط§طµظ„ ظˆط§ظ„ظ…ظ„ط§ط­ط¸ط©");
      updateDraft(customer.id,{notes:""});
      load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± ط­ظپط¸ ط§ظ„ظ…طھط§ط¨ط¹ط©");
    }
  }

  const minDays=Number(days||7);
  const rows=(Array.isArray(data.rows)?data.rows:[])
    .filter(customer=>Number(customer.overdueDays||0)>=minDays)
    .filter(customer=>
      `${customer.name||""} ${customer.phone||""}`.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a,b)=>Number(b.overdueDays||0)-Number(a.overdueDays||0));

  const filteredTotal=rows.reduce((sum,customer)=>sum+Number(customer.finalBalance||0),0);
  const largest=rows.reduce((max,item)=>Number(item.finalBalance||0)>Number(max?.finalBalance||0)?item:max,null);
  const oldest=rows[0];

  function severity(daysLate){
    if(daysLate>=60)return "critical";
    if(daysLate>=30)return "danger";
    if(daysLate>=15)return "warning";
    return "notice";
  }

  return <>
    <div className="dashboard-title">
      <h2>âڈ° ظ…ط±ظƒط² طھط­طµظٹظ„ ط§ظ„ط¹ظ…ظ„ط§ط، ط§ظ„ظ…طھط£ط®ط±ظٹظ†</h2>
      <button onClick={load}>طھط­ط¯ظٹط« ط§ظ„ظ‚ط§ط¦ظ…ط©</button>
    </div>

    {error&&<div className="card customer-error">{error}</div>}
    {success&&<div className="card rate-message">{success}</div>}

    <div className="stats overdue-top-stats">
      <div className="card overdue-card"><span>ط¹ط¯ط¯ ط§ظ„ط¹ظ…ظ„ط§ط، ط§ظ„ظ…طھط£ط®ط±ظٹظ†</span><strong>{rows.length}</strong></div>
      <div className="card overdue-card"><span>ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ظ…ط¨ط§ظ„ط؛ ط§ظ„ظ…طھط£ط®ط±ط©</span><strong>{money(filteredTotal)} CAD</strong></div>
      <div className="card"><span>ط£ظƒط¨ط± ط±طµظٹط¯ ظ…طھط£ط®ط±</span><strong>{money(largest?.finalBalance||0)} CAD</strong><small>{largest?.name||"-"}</small></div>
      <div className="card"><span>ط£ظƒط«ط± ط¹ظ…ظٹظ„ طھط£ط®ط±ظ‹ط§</span><strong>{oldest?.name||"-"}</strong><small>{oldest?`${oldest.overdueDays} ظٹظˆظ…`:"0 ظٹظˆظ…"}</small></div>
      <div className="card expected-today-card"><span>ط§ظ„ظ…طھظˆظ‚ط¹ طھط­طµظٹظ„ظ‡ ط§ظ„ظٹظˆظ…</span><strong>{money(data.expectedToday||0)} CAD</strong></div>
    </div>

    <div className="card overdue-filters">
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ط¨ط­ط« ط¨ط§ط³ظ… ط§ظ„ط¹ظ…ظٹظ„ ط£ظˆ ط±ظ‚ظ… ط§ظ„ظ‡ط§طھظپ"/>
      <select value={days} onChange={e=>setDays(e.target.value)}>
        <option value="7">ط£ظƒط«ط± ظ…ظ† 7 ط£ظٹط§ظ…</option>
        <option value="15">ط£ظƒط«ط± ظ…ظ† 15 ظٹظˆظ…ظ‹ط§</option>
        <option value="30">ط£ظƒط«ط± ظ…ظ† 30 ظٹظˆظ…ظ‹ط§</option>
        <option value="60">ط£ظƒط«ط± ظ…ظ† 60 ظٹظˆظ…ظ‹ط§</option>
      </select>
    </div>

    <div className="overdue-customers-grid">
      {rows.length?rows.map(customer=>{
        const draft={promiseDate:"",expectedAmount:"",notes:"",messageType:"gentle",...(drafts[customer.id]||{})};
        return <article className={`card overdue-customer-card severity-${severity(customer.overdueDays)}`} key={customer.id}>
          <div className="overdue-customer-head">
            <div>
              <h3>{customer.name}</h3>
              <p>{customer.phone||"ظ„ط§ ظٹظˆط¬ط¯ ط±ظ‚ظ… ظ‡ط§طھظپ"}</p>
            </div>
            <span>{customer.overdueDays} ظٹظˆظ…</span>
          </div>

          <div className="overdue-customer-details expanded">
            <div><span>ط§ظ„ط±طµظٹط¯ ط§ظ„ظ…طھط¨ظ‚ظٹ</span><strong>{cad(customer.finalBalance)} CAD</strong></div>
            <div><span>ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط­ط³ط§ط¨</span><strong>{cad(customer.totalTransactions)} CAD</strong></div>
            <div><span>ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ظ…ط¯ظپظˆط¹</span><strong>{cad(customer.totalPaid)} CAD</strong></div>
            <div><span>ط£ظ‚ط¯ظ… ط­ظˆط§ظ„ط© ط؛ظٹط± ظ…ط¯ظپظˆط¹ط©</span><strong>{customer.oldestUnpaidDate||"-"}</strong></div>
            <div><span>ط¢ط®ط± ط¯ظپط¹ط©</span><strong>{customer.lastPaymentDate||"-"}</strong></div>
            <div><span>ط¢ط®ط± ظ…طھط§ط¨ط¹ط©</span><strong>{customer.latestAction?.action||"-"}</strong></div>
          </div>

          {customer.promiseDate&&<div className="promise-banner">
            ظˆط¹ط¯ ط¨ط§ظ„ط¯ظپط¹: <strong>{customer.promiseDate}</strong>
            {customer.expectedAmount!=null&&<> â€” {money(customer.expectedAmount)} CAD</>}
          </div>}

          <div className="whatsapp-options">
            <label>ظ†ظˆط¹ ط±ط³ط§ظ„ط© ظˆط§طھط³ط§ط¨</label>
            <select value={draft.messageType} onChange={e=>updateDraft(customer.id,{messageType:e.target.value})}>
              <option value="gentle">طھط°ظƒظٹط± ظ„ط·ظٹظپ</option>
              <option value="formal">طھط°ظƒظٹط± ط±ط³ظ…ظٹ</option>
              <option value="statement">ظ…ظ„ط®طµ ظƒط´ظپ ط§ظ„ط­ط³ط§ط¨</option>
            </select>
          </div>

          <div className="followup-form">
            <input type="date" value={draft.promiseDate} onChange={e=>updateDraft(customer.id,{promiseDate:e.target.value})}/>
            <input type="number" step=".01" value={draft.expectedAmount} onChange={e=>updateDraft(customer.id,{expectedAmount:e.target.value})} placeholder="ط§ظ„ظ…ط¨ظ„ط؛ ط§ظ„ظ…طھظˆظ‚ط¹"/>
            <input value={draft.notes} onChange={e=>updateDraft(customer.id,{notes:e.target.value})} placeholder="ظ…ظ„ط§ط­ط¸ط© ظ…ط«ظ„: ظˆط¹ط¯ ط¨ط§ظ„ط¯ظپط¹ ظٹظˆظ… ط§ظ„ط¬ظ…ط¹ط©"/>
          </div>

          <div className="customer-card-actions overdue-actions">
            <button onClick={()=>openCustomer(customer.id)}>ظپطھط­ ط§ظ„ط­ط³ط§ط¨</button>
            <button onClick={()=>openCustomer(customer.id)}>ط¥ط¶ط§ظپط© ط¯ظپط¹ط©</button>
            <button onClick={()=>onStatement(customer.id)}>ط·ط¨ط§ط¹ط© / PDF</button>
            <button className="whatsapp-button" onClick={()=>sendWhatsapp(customer)}>ط¥ط±ط³ط§ظ„ ظˆط§طھط³ط§ط¨</button>
            <button onClick={()=>saveAction(customer,"CONTACTED")}>طھظ… ط§ظ„طھظˆط§طµظ„</button>
            <button onClick={()=>saveAction(customer,"PROMISE_TO_PAY")}>ط­ظپط¸ ظˆط¹ط¯ ط§ظ„ط¯ظپط¹</button>
            <button onClick={navigateCustomers}>طھط¹ط¯ظٹظ„ ط§ظ„ط¹ظ…ظٹظ„</button>
          </div>
        </article>
      }):<div className="card">ظ„ط§ ظٹظˆط¬ط¯ ط¹ظ…ظ„ط§ط، ظ…طھط£ط®ط±ظˆظ† ط¶ظ…ظ† ط§ظ„ظپظ„طھط± ط§ظ„ظ…ط­ط¯ط¯.</div>}
    </div>
  </>;
}

function Customer({id,back,onStatement}){
  const [data,setData]=useState(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [paymentForm,setPaymentForm]=useState({
    amount:"",
    paymentDate:new Date().toISOString().slice(0,10),
    method:"CASH",
    reference:"",
    notes:""
  });
  const [editingTransaction,setEditingTransaction]=useState(null);
  const [editingPayment,setEditingPayment]=useState(null);
  const [oldBalanceForm,setOldBalanceForm]=useState("");
  const [savingOldBalance,setSavingOldBalance]=useState(false);

  async function load(){
    setLoading(true);
    setError("");
    try{
      const response=await api.get(`/customers/${id}`);
      const result=response?.data||{};
      const loadedCustomer=result.customer||{name:"ط¹ظ…ظٹظ„"};
      setData({
        customer:loadedCustomer,
        transactions:Array.isArray(result.transactions)?result.transactions:[],
        payments:Array.isArray(result.payments)?result.payments:[],
      });
      setOldBalanceForm(String(loadedCustomer.oldBalance??""));
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± طھط­ظ…ظٹظ„ ظ…ظ„ظپ ط§ظ„ط¹ظ…ظٹظ„");
      setData(null);
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{load();},[id]);

  async function saveOldBalance(event){
    event.preventDefault();
    setSavingOldBalance(true);
    setError("");
    try{
      await api.patch(`/customers/${id}`,{
        oldBalance:Number(oldBalanceForm||0)
      });
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± ط­ظپط¸ ط§ظ„ط­ط³ط§ط¨ ط§ظ„ظ‚ط¯ظٹظ…");
    }finally{
      setSavingOldBalance(false);
    }
  }

  async function addPayment(event){
    event.preventDefault();
    try{
      await api.post(`/customers/${id}/payments`,{
        amount:Number(paymentForm.amount),
        paymentDate:paymentForm.paymentDate,
        method:paymentForm.method,
        reference:paymentForm.reference,
        notes:paymentForm.notes
      });
      setPaymentForm({
        amount:"",
        paymentDate:new Date().toISOString().slice(0,10),
        method:"CASH",
        reference:"",
        notes:""
      });
      await load();
    }catch(error){
      setError(error.response?.data?.message||error.message||"طھط¹ط°ط± ط­ظپط¸ ط§ظ„ط¯ظپط¹ط©");
    }
  }

  async function shareCustomerStatementText(){
    try{
      const phone=String(customer.phone||"").replace(/\D/g,"");
      if(!phone){
        setError("ظ„ط§ ظٹظˆط¬ط¯ ط±ظ‚ظ… ظˆط§طھط³ط§ط¨ ظ…ط­ظپظˆط¸ ظ„ظ‡ط°ط§ ط§ظ„ط¹ظ…ظٹظ„");
        return;
      }

      const response=await api.get(`/customers/${id}/statement`);
      const statement=response.data;
      const rows=Array.isArray(statement.transactions)?statement.transactions:[];
      const oldBalance=Number(statement.totals?.oldBalance||0);
      const total=Number(statement.totals?.formulaResultCad||0)+oldBalance;
      const paid=Number(statement.totals?.paid||0);
      const finalBalance=Number(statement.totals?.remaining||Math.max(total-paid,0));

      const lines=rows.map((item,index)=>{
        const amount=Number(item.usdAmount||0).toFixed(2).replace(/\.00$/,"");
        const rate=Number(item.customerRate||0).toFixed(4).replace(/0+$/,"").replace(/\.$/,"");
        return `${index+1}_ ${amount} ًں‡؛ًں‡¸ أ— ${rate} = ${money(item.formulaResultCad)} ًں‡¨ًں‡¦`;
      });

      const message=[
        statement.company?.name||"ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ط§ظ„طھط¬ط§ط±ظٹط©",
        "",
        "ظƒط´ظپ ط­ط³ط§ط¨ ط§ظ„ط¹ظ…ظٹظ„",
        customer.name,
        "",
        ...lines,
        "",
        "--------------------",
        `ط§ظ„ط­ط³ط§ط¨ ط§ظ„ظ‚ط¯ظٹظ…: ${money(oldBalance)} ًں‡¨ًں‡¦`,
        `ط§ظ„ط¯ظپط¹ط§طھ: ${money(paid)} ًں‡¨ًں‡¦`,
        `ط§ظ„ظ…ط¬ظ…ظˆط¹ ط§ظ„ظ†ظ‡ط§ط¦ظٹ: ${money(finalBalance)} ًں‡¨ًں‡¦`
      ].join("\n");

      openRegularWhatsApp(phone,message);
    }catch(error){
      setError(error.response?.data?.message||error.message||"طھط¹ط°ط± ط¥ط±ط³ط§ظ„ ط±ط³ط§ظ„ط© ظƒط´ظپ ط§ظ„ط­ط³ط§ط¨");
    }
  }

  async function shareCustomerStatement(){
    try{
      const response=await api.get(`/customers/${id}/statement`);
      const statement=response.data||{};
      const rows=Array.isArray(statement.transactions)?statement.transactions:[];
      const oldBalance=Number(statement.totals?.oldBalance||0);
      const paid=Number(statement.totals?.paid||0);
      const finalBalance=Number(
        statement.totals?.remaining ??
        Math.max(Number(statement.totals?.formulaResultCad||0)+oldBalance-paid,0)
      );

      const width=720;
      const sidePadding=34;
      const rowHeight=54;
      const headerHeight=205;
      const summaryHeight=188;
      const footerHeight=82;
      const height=headerHeight+(rows.length*rowHeight)+summaryHeight+footerHeight;

      const canvas=document.createElement("canvas");
      canvas.width=width;
      canvas.height=height;
      const ctx=canvas.getContext("2d");
      if(!ctx)throw new Error("طھط¹ط°ط± ط¥ظ†ط´ط§ط، طµظˆط±ط© ظƒط´ظپ ط§ظ„ط­ط³ط§ط¨");

      const drawText=(value,x,y,size,{color="#f5f5f5",align="center",weight="700",direction="rtl"}={})=>{
        ctx.save();
        ctx.fillStyle=color;
        ctx.font=`${weight} ${size}px Arial, sans-serif`;
        ctx.textAlign=align;
        ctx.textBaseline="middle";
        ctx.direction=direction;
        ctx.fillText(String(value??""),x,y);
        ctx.restore();
      };

      const drawLine=(y,color="#51606b",dash=[])=>{
        ctx.save();
        ctx.strokeStyle=color;
        ctx.lineWidth=1.5;
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(sidePadding,y);
        ctx.lineTo(width-sidePadding,y);
        ctx.stroke();
        ctx.restore();
      };

      const gradient=ctx.createLinearGradient(0,0,width,height);
      gradient.addColorStop(0,"#142331");
      gradient.addColorStop(1,"#08131c");
      ctx.fillStyle=gradient;
      ctx.fillRect(0,0,width,height);

      ctx.strokeStyle="#9b7425";
      ctx.lineWidth=2;
      ctx.strokeRect(14,14,width-28,height-28);

      drawText(statement.company?.name||"ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ط§ظ„طھط¬ط§ط±ظٹط©",width/2,50,34,{weight:"800"});
      drawText("ظƒط´ظپ ط­ط³ط§ط¨ ط§ظ„ط¹ظ…ظٹظ„",width/2,101,30,{color:"#d8a33f",weight:"800"});
      drawText(customer.name||"ط§ظ„ط¹ظ…ظٹظ„",width/2,147,26,{weight:"700"});
      drawLine(180);

      let y=219;
      rows.forEach((item,index)=>{
        const amount=Number(item.usdAmount||item.amount||0).toFixed(2).replace(/\.00$/,"");
        const rate=Number(item.customerRate||item.finalRate||0).toFixed(4).replace(/0+$/,"").replace(/\.$/,"");
        const result=money(item.formulaResultCad ?? item.totalCad ?? 0);

        drawText(
          `${index+1}_ ${amount} ًں‡؛ًں‡¸ أ— ${rate} = ${result} ًں‡¨ًں‡¦`,
          sidePadding,
          y,
          24,
          {align:"left",direction:"ltr",weight:"700"}
        );
        drawLine(y+27,"#283844");
        y+=rowHeight;
      });

      drawLine(y+7,"#68747c",[10,8]);
      y+=37;

      drawText("ط§ظ„ط­ط³ط§ط¨ ط§ظ„ظ‚ط¯ظٹظ…",sidePadding,y,23,{align:"left"});
      drawText(`${money(oldBalance)} ًں‡¨ًں‡¦`,width-sidePadding,y,24,{align:"right",color:"#d8a33f",weight:"800"});
      y+=48;

      drawText("ط§ظ„ط¯ظپط¹ط§طھ",sidePadding,y,23,{align:"left"});
      drawText(`${money(paid)} ًں‡¨ًں‡¦`,width-sidePadding,y,24,{align:"right",color:"#ef4444",weight:"800"});
      y+=48;

      drawText("ط§ظ„ظ…ط¬ظ…ظˆط¹ ط§ظ„ظ†ظ‡ط§ط¦ظٹ",sidePadding,y,25,{align:"left",weight:"800"});
      drawText(`${money(finalBalance)} ًں‡¨ًں‡¦`,width-sidePadding,y,28,{align:"right",color:"#63c443",weight:"900"});
      y+=46;

      drawLine(y+4,"#68747c");
      y+=34;

      const nowDate=new Date();
      drawText(`ط§ظ„طھط§ط±ظٹط®: ${nowDate.toLocaleDateString("en-CA")}`,sidePadding,y,18,{align:"left",color:"#b8c0c7",weight:"500"});
      drawText(`ط§ظ„ظˆظ‚طھ: ${nowDate.toLocaleTimeString("ar-CA",{hour:"2-digit",minute:"2-digit"})}`,width-sidePadding,y,18,{align:"right",color:"#b8c0c7",weight:"500"});
      drawText("ط´ظƒط±ط§ظ‹ ظ„طھط¹ط§ظ…ظ„ظƒظ… ظ…ط¹ظ†ط§",width/2,height-34,22,{color:"#d8a33f"});

      const blob=await new Promise((resolve,reject)=>{
        canvas.toBlob(value=>value?resolve(value):reject(new Error("طھط¹ط°ط± ط¥ظ†ط´ط§ط، طµظˆط±ط© ظƒط´ظپ ط§ظ„ط­ط³ط§ط¨")),"image/png",0.96);
      });

      const safeName=String(customer.name||"customer").replace(/[\\/:*?"<>|]+/g,"-");
      const file=new File([blob],`ظƒط´ظپ-ط­ط³ط§ط¨-${safeName}.png`,{type:"image/png"});

      showImageShareOptionsGlobal(blob,file,"ظƒط´ظپ ط­ط³ط§ط¨ ط§ظ„ط¹ظ…ظٹظ„");
    }catch(error){
      setError(error.response?.data?.message||error.message||"طھط¹ط°ط± ظ…ط´ط§ط±ظƒط© طµظˆط±ط© ظƒط´ظپ ط§ظ„ط­ط³ط§ط¨");
    }
  }

  async function saveTransaction(event){
    event.preventDefault();
    try{
      await api.patch(`/transactions/${editingTransaction.id}`,editingTransaction);
      setEditingTransaction(null);
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± طھط¹ط¯ظٹظ„ ط§ظ„ط­ظˆط§ظ„ط©");
    }
  }

  async function deleteTransaction(transactionId){
    if(!window.confirm("ظ‡ظ„ ط£ظ†طھ ظ…طھط£ظƒط¯ ظ…ظ† ط­ط°ظپ ط§ظ„ط­ظˆط§ظ„ط©طں ط³ظٹطھظ… ط­ط°ظپ ط¯ظپط¹ط§طھظ‡ط§ ظ…ظ†ط·ظ‚ظٹظ‹ط§."))return;
    try{
      await api.delete(`/transactions/${transactionId}`);
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± ط­ط°ظپ ط§ظ„ط­ظˆط§ظ„ط©");
    }
  }

  async function savePayment(event){
    event.preventDefault();
    try{
      await api.patch(`/payments/${editingPayment.id}`,editingPayment);
      setEditingPayment(null);
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± طھط¹ط¯ظٹظ„ ط§ظ„ط¯ظپط¹ط©");
    }
  }

  async function deletePayment(paymentId){
    if(!window.confirm("ظ‡ظ„ طھط±ظٹط¯ ط­ط°ظپ ظ‡ط°ظ‡ ط§ظ„ط¯ظپط¹ط©طں"))return;
    try{
      await api.delete(`/payments/${paymentId}`);
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± ط­ط°ظپ ط§ظ„ط¯ظپط¹ط©");
    }
  }

  if(loading)return <><button onClick={back}>ط±ط¬ظˆط¹</button><p>ط¬ط§ط±ظٹ طھط­ظ…ظٹظ„ ظ…ظ„ظپ ط§ظ„ط¹ظ…ظٹظ„...</p></>;
  if(error&&!data)return <div className="card customer-error"><button onClick={back}>ط±ط¬ظˆط¹</button><h3>طھط¹ط°ط± ظپطھط­ ظ…ظ„ظپ ط§ظ„ط¹ظ…ظٹظ„</h3><p>{error}</p><button onClick={load}>ط¥ط¹ط§ط¯ط© ط§ظ„ظ…ط­ط§ظˆظ„ط©</button></div>;

  const customer=data?.customer||{};
  const transactions=Array.isArray(data?.transactions)?data.transactions:[];
  const payments=Array.isArray(data?.payments)?data.payments:[];
  const unpaidTransactions=transactions.filter(transaction=>Number(transaction?.remaining||0)>0);

  return <>
    <div className="card no-print form">
      <button onClick={back}>ط±ط¬ظˆط¹</button>
      <button onClick={()=>onStatement(id)}>ظƒط´ظپ ط­ط³ط§ط¨ ط§ظ„ط¹ظ…ظٹظ„</button>
      <button className="whatsapp-text-button" onClick={shareCustomerStatementText}>ًں’¬ ط¥ط±ط³ط§ظ„ ط±ط³ط§ظ„ط© ظ†طµظٹط© ط¹ط¨ط± ظˆط§طھط³ط§ط¨</button>
      <button className="whatsapp-image-button" onClick={shareCustomerStatement}>ًں“· ط¥ط±ط³ط§ظ„ طµظˆط±ط© ط¹ط¨ط± ظˆط§طھط³ط§ط¨</button>
    </div>

    <h2>{customer.name||"ط§ظ„ط¹ظ…ظٹظ„"}</h2>
    {error&&<div className="card customer-error">{error}</div>}

    <div className="stats">
      <form className="card old-balance-card old-balance-edit-card" onSubmit={saveOldBalance}>
        <span>ط§ظ„ط­ط³ط§ط¨ ط§ظ„ظ‚ط¯ظٹظ…</span>
        <input
          type="number"
          min="0"
          step=".01"
          inputMode="decimal"
          value={oldBalanceForm}
          onChange={event=>setOldBalanceForm(event.target.value)}
          placeholder="ط§ظƒطھط¨ ط§ظ„ط­ط³ط§ط¨ ط§ظ„ظ‚ط¯ظٹظ…"
        />
        <small>ط§ظ„ظ…طھط¨ظ‚ظٹ: {cad(customer.oldBalanceRemaining||0)}</small>
        <button type="submit" disabled={savingOldBalance}>
          {savingOldBalance?"ط¬ط§ط±ظٹ ط§ظ„ط­ظپط¸...":"ط­ظپط¸ ط§ظ„ط­ط³ط§ط¨ ط§ظ„ظ‚ط¯ظٹظ…"}
        </button>
      </form>
      <div className="card"><span>ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط­ط³ط§ط¨</span><strong>{cad(customer.totalTransactions)}</strong></div>
      <div className="card"><span>ط§ظ„ظ…ط¯ظپظˆط¹</span><strong>{cad(customer.totalPaid)}</strong></div>
      <div className="card final"><span>ط§ظ„ط­ط³ط§ط¨ ط§ظ„ظ†ظ‡ط§ط¦ظٹ</span><strong>{cad(customer.finalBalance)}</strong></div>
    </div>

    {unpaidTransactions.length>0&&
      <form className="card form" onSubmit={addPayment}>
        <h3>ط¥ط¶ط§ظپط© ط¯ظپط¹ط©</h3>
        <p className="payment-auto-note">طھظڈظˆط²ط¹ ط§ظ„ط¯ظپط¹ط© طھظ„ظ‚ط§ط¦ظٹظ‹ط§ ط¹ظ„ظ‰ ط£ظ‚ط¯ظ… ط§ظ„ط­ظˆط§ظ„ط§طھ ط§ظ„ظ…ط³طھط­ظ‚ط©.</p>
        <input type="number" min=".01" step=".01" value={paymentForm.amount} onChange={e=>setPaymentForm({...paymentForm,amount:e.target.value})} placeholder="ط§ظ„ظ…ط¨ظ„ط؛" required/>
        <input type="date" value={paymentForm.paymentDate} onChange={e=>setPaymentForm({...paymentForm,paymentDate:e.target.value})}/>
        <select value={paymentForm.method} onChange={e=>setPaymentForm({...paymentForm,method:e.target.value})}>
          <option value="CASH">ظ†ظ‚ط¯ظٹ</option>
          <option value="BANK">ط¨ظ†ظƒ</option>
          <option value="TRANSFER">طھط­ظˆظٹظ„</option>
          <option value="CARD">ط¨ط·ط§ظ‚ط©</option>
        </select>
        <input value={paymentForm.reference} onChange={e=>setPaymentForm({...paymentForm,reference:e.target.value})} placeholder="ط±ظ‚ظ… ط§ظ„ظ…ط±ط¬ط¹"/>
        <input value={paymentForm.notes} onChange={e=>setPaymentForm({...paymentForm,notes:e.target.value})} placeholder="ظ…ظ„ط§ط­ط¸ط§طھ"/>
        <button>ط­ظپط¸ ط§ظ„ط¯ظپط¹ط©</button>
      </form>
    }

    {editingTransaction&&
      <form className="card form edit-panel" onSubmit={saveTransaction}>
        <h3>طھط¹ط¯ظٹظ„ ط§ظ„ط­ظˆط§ظ„ط© {editingTransaction.number}</h3>
        <input type="date" value={editingTransaction.transferDate||""} onChange={e=>setEditingTransaction({...editingTransaction,transferDate:e.target.value})}/>
        <input type="number" step=".01" value={editingTransaction.amount} onChange={e=>setEditingTransaction({...editingTransaction,amount:e.target.value})} placeholder="ط§ظ„ظ…ط¨ظ„ط؛"/>
        <input type="number" step=".0001" value={editingTransaction.costRate} onChange={e=>setEditingTransaction({...editingTransaction,costRate:e.target.value})} placeholder="ط³ط¹ط± ط§ظ„طھظƒظ„ظپط© (CAD)"/>
        <input type="number" step=".0001" value={editingTransaction.finalRate} onChange={e=>setEditingTransaction({...editingTransaction,finalRate:e.target.value})} placeholder="ط³ط¹ط± ط§ظ„ط­ظˆط§ظ„ط© (CAD)"/>
        <input type="number" step=".01" value={editingTransaction.transferFee} onChange={e=>setEditingTransaction({...editingTransaction,transferFee:e.target.value})} placeholder="ط§ظ„ط£ط¬ظˆط±"/>
        <select value={editingTransaction.feeMethod} onChange={e=>setEditingTransaction({...editingTransaction,feeMethod:e.target.value})}>
          <option value="ADD">ط¥ط¶ط§ظپط© ط§ظ„ط£ط¬ظˆط±</option>
          <option value="DEDUCT">ط®طµظ… ط§ظ„ط£ط¬ظˆط±</option>
        </select>
        <button>ط­ظپط¸ ط§ظ„طھط¹ط¯ظٹظ„</button>
        <button type="button" onClick={()=>setEditingTransaction(null)}>ط¥ظ„ط؛ط§ط،</button>
      </form>
    }

    {editingPayment&&
      <form className="card form edit-panel" onSubmit={savePayment}>
        <h3>طھط¹ط¯ظٹظ„ ط§ظ„ط¯ظپط¹ط©</h3>
        <input type="number" min=".01" step=".01" value={editingPayment.amount} onChange={e=>setEditingPayment({...editingPayment,amount:e.target.value})}/>
        <input type="date" value={editingPayment.paymentDate||String(editingPayment.date||"").slice(0,10)} onChange={e=>setEditingPayment({...editingPayment,paymentDate:e.target.value})}/>
        <select value={editingPayment.method||"CASH"} onChange={e=>setEditingPayment({...editingPayment,method:e.target.value})}>
          <option value="CASH">ظ†ظ‚ط¯ظٹ</option>
          <option value="BANK">ط¨ظ†ظƒ</option>
          <option value="TRANSFER">طھط­ظˆظٹظ„</option>
          <option value="CARD">ط¨ط·ط§ظ‚ط©</option>
        </select>
        <input value={editingPayment.reference||""} onChange={e=>setEditingPayment({...editingPayment,reference:e.target.value})} placeholder="ط§ظ„ظ…ط±ط¬ط¹"/>
        <input value={editingPayment.notes||""} onChange={e=>setEditingPayment({...editingPayment,notes:e.target.value})} placeholder="ظ…ظ„ط§ط­ط¸ط§طھ"/>
        <button>ط­ظپط¸ ط§ظ„طھط¹ط¯ظٹظ„</button>
        <button type="button" onClick={()=>setEditingPayment(null)}>ط¥ظ„ط؛ط§ط،</button>
      </form>
    }

    <div className="card tablewrap">
      <h3>ط§ظ„ط­ظˆط§ظ„ط§طھ</h3>
      <table>
        <thead><tr><th>ط§ظ„ط±ظ‚ظ…</th><th>ط§ظ„طھط§ط±ظٹط®</th><th>ط§ظ„ط¥ط¬ظ…ط§ظ„ظٹ</th><th>ط§ظ„ظ…ط¯ظپظˆط¹</th><th>ط§ظ„ظ…طھط¨ظ‚ظٹ</th><th>ط§ظ„ط¥ط¬ط±ط§ط،ط§طھ</th></tr></thead>
        <tbody>{transactions.length?transactions.map(transaction=><tr key={transaction.id}>
          <td>{transaction.number}</td>
          <td>{transaction.transferDate||String(transaction.createdAt||"").slice(0,10)}</td>
          <td>{money(transaction.totalCustomerDue)}</td>
          <td>{money(transaction.paid)}</td>
          <td>{money(transaction.remaining)}</td>
          <td className="actions">
            <button onClick={()=>setEditingTransaction({...transaction})}>طھط¹ط¯ظٹظ„</button>
            <button className="danger-button" onClick={()=>deleteTransaction(transaction.id)}>ط­ط°ظپ</button>
          </td>
        </tr>):<tr><td colSpan="6">ظ„ط§ طھظˆط¬ط¯ ط­ظˆط§ظ„ط§طھ.</td></tr>}</tbody>
      </table>
    </div>

    <div className="card tablewrap">
      <h3>ط³ط¬ظ„ ط§ظ„ط¯ظپط¹ط§طھ</h3>
      <table>
        <thead><tr><th>ط§ظ„طھط§ط±ظٹط®</th><th>ط§ظ„ط­ظˆط§ظ„ط©</th><th>ط§ظ„ظ…ط¨ظ„ط؛</th><th>ط§ظ„ط·ط±ظٹظ‚ط©</th><th>ط§ظ„ظ…ط±ط¬ط¹</th><th>ط§ظ„ط¥ط¬ط±ط§ط،ط§طھ</th></tr></thead>
        <tbody>{payments.length?payments.map(payment=>{
          const transaction=transactions.find(item=>item.id===payment.transactionId);
          return <tr key={payment.id}>
            <td>{payment.paymentDate||String(payment.date||"").slice(0,10)}</td>
            <td>{transaction?.number||"-"}</td>
            <td>{money(payment.amount)}</td>
            <td>{payment.method||"-"}</td>
            <td>{payment.reference||"-"}</td>
            <td className="actions">
              <button onClick={()=>setEditingPayment({...payment})}>طھط¹ط¯ظٹظ„</button>
              <button className="danger-button" onClick={()=>deletePayment(payment.id)}>ط­ط°ظپ</button>
            </td>
          </tr>
        }):<tr><td colSpan="6">ظ„ط§ طھظˆط¬ط¯ ط¯ظپط¹ط§طھ.</td></tr>}</tbody>
      </table>
    </div>
  </>;
}

function Invoice({transactionId,back}){
  const [data,setData]=useState(null);
  const [error,setError]=useState("");

  useEffect(()=>{
    api.get(`/transactions/${transactionId}/invoice`)
      .then(response=>setData(response.data))
      .catch(requestError=>setError(requestError.response?.data?.message||"طھط¹ط°ط± طھط­ظ…ظٹظ„ ط§ظ„ظپط§طھظˆط±ط©"));
  },[transactionId]);

  function sendWhatsApp(){
    if(!data)return;
    const phone=String(data.customer.phone||"").replace(/\D/g,"");
    if(!phone){
      setError("ظ„ط§ ظٹظˆط¬ط¯ ط±ظ‚ظ… ظ‡ط§طھظپ ظ…ط­ظپظˆط¸ ظ„ظ„ط¹ظ…ظٹظ„");
      return;
    }
    const message=[
      `ط§ظ„ط³ظ„ط§ظ… ط¹ظ„ظٹظƒظ… ${data.customer.name}طŒ`,
      `ظپط§طھظˆط±طھظƒظ… ظ…ظ† ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ظ„ظ„طھط¬ط§ط±ط©`,
      `ط±ظ‚ظ… ط§ظ„ظپط§طھظˆط±ط©: ${data.invoiceNumber}`,
      `ط§ظ„طھط§ط±ظٹط®: ${data.invoiceDate}`,
      `ط§ظ„ط¥ط¬ظ…ط§ظ„ظٹ: ${money(data.transaction.totalCustomerDue)}`,
      `ط§ظ„ظ…ط¯ظپظˆط¹: ${money(data.transaction.paid)}`,
      `ط§ظ„ظ…طھط¨ظ‚ظٹ: ${money(data.transaction.remaining)}`
    ].join("\n");
    openRegularWhatsApp(phone,message);
  }

  if(error&&!data)return <div className="card customer-error"><button onClick={back}>ط±ط¬ظˆط¹</button><p>{error}</p></div>;
  if(!data)return <p>ط¬ط§ط±ظٹ طھط­ظ…ظٹظ„ ط§ظ„ظپط§طھظˆط±ط©...</p>;

  const t=data.transaction;

  return <>
    <div className="card no-print form">
      <button onClick={back}>ط±ط¬ظˆط¹</button>
      <button onClick={()=>window.print()}>ط·ط¨ط§ط¹ط© / ط­ظپط¸ PDF</button>
      <button onClick={sendWhatsApp}>ط¥ط±ط³ط§ظ„ ط¹ط¨ط± ظˆط§طھط³ط§ط¨</button>
    </div>

    {error&&<div className="card customer-error">{error}</div>}

    <section className="invoice-sheet">
      <div className="invoice-header">
        <div>
          <h1>{data.company.name}</h1>
          <p>{data.company.nameEn}</p>
          <h3>ظپط§طھظˆط±ط© ط­ظˆط§ظ„ط© ظ…ط§ظ„ظٹط©</h3>
        </div>
        <div>
          <p><strong>ط±ظ‚ظ… ط§ظ„ظپط§طھظˆط±ط©:</strong> {data.invoiceNumber}</p>
          <p><strong>طھط§ط±ظٹط® ط§ظ„ط­ظˆط§ظ„ط©:</strong> {data.invoiceDate}</p>
        </div>
      </div>

      <div className="invoice-customer">
        <p><strong>ط§ط³ظ… ط§ظ„ط¹ظ…ظٹظ„:</strong> {data.customer.name}</p>
        <p><strong>ط§ظ„ظ‡ط§طھظپ:</strong> {data.customer.phone||"-"}</p>
        <p><strong>ط§ظ„ط¨ط±ظٹط¯:</strong> {data.customer.email||"-"}</p>
      </div>

      <table>
        <tbody>
          <tr><th>ظ…ط¨ظ„ط؛ ط§ظ„ط­ظˆط§ظ„ط©</th><td>{money(t.amount)}</td></tr>
          <tr><th>ط³ط¹ط± ط§ظ„ط­ظˆط§ظ„ط©</th><td>{Number(t.finalRate||0).toFixed(4)}</td></tr>
          <tr><th>ط£ط¬ظˆط± ط§ظ„ط­ظˆط§ظ„ط©</th><td>{money(t.transferFee)}</td></tr>
          <tr><th>ط§ظ„ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ظ…ط·ظ„ظˆط¨</th><td>{money(t.totalCustomerDue)}</td></tr>
          <tr><th>ط§ظ„ظ…ط¯ظپظˆط¹</th><td>{money(t.paid)}</td></tr>
          <tr><th>ط§ظ„ظ…طھط¨ظ‚ظٹ</th><td><strong>{money(t.remaining)}</strong></td></tr>
        </tbody>
      </table>

      <p className="invoice-note">ط´ظƒط±ط§ظ‹ ظ„طھط¹ط§ظ…ظ„ظƒظ… ظ…ط¹ ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ظ„ظ„طھط¬ط§ط±ط©.</p>
    </section>
  </>;
}

function Statement({customerId,back}){
  const [filters,setFilters]=useState({from:"",to:""});
  const [data,setData]=useState(null);
  const [error,setError]=useState("");

  async function load(){
    setError("");
    try{
      const response=await api.get(`/customers/${customerId}/statement`,{params:filters});
      setData(response.data);
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± ط¥ظ†ط´ط§ط، ظƒط´ظپ ط§ظ„ط­ط³ط§ط¨");
    }
  }

  useEffect(()=>{load();},[customerId]);

  return <>
    <div className="card no-print statement-toolbar">
      <button onClick={back}>ط±ط¬ظˆط¹</button>
      <input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})}/>
      <input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})}/>
      <button onClick={load}>ط¹ط±ط¶ ظƒط´ظپ ط§ظ„ط­ط³ط§ط¨</button>
      <button onClick={()=>window.print()} disabled={!data}>ط·ط¨ط§ط¹ط© / ط­ظپط¸ PDF</button>
    </div>

    {error&&<div className="card customer-error">{error}</div>}

    {data&&<section className="invoice-sheet simple-customer-statement" dir="rtl">
      <div className="simple-statement-heading">
        {data.company.logoDataUrl&&<img src={data.company.logoDataUrl} alt={data.company.name}/>}
        <h1>{data.company.name}</h1>
        <h2>ظƒط´ظپ ط­ط³ط§ط¨ ط§ظ„ط¹ظ…ظٹظ„</h2>
        <h3>{data.customer.name}</h3>
      </div>

      <div className="tablewrap">
        <table className="simple-statement-table">
          <thead>
            <tr>
              <th>#</th>
              <th>ظ…ط¨ظ„ط؛ ط§ظ„ط­ظˆط§ظ„ط©</th>
              <th>ط³ط¹ط± ط§ظ„طھط­ظˆظٹظ„</th>
              <th>ط§ظ„ظ†طھظٹط¬ط©</th>
            </tr>
          </thead>
          <tbody>
            {data.transactions.length?
              data.transactions.map((item,index)=><tr key={item.id}>
                <td>{index+1}</td>
                <td>{Number(item.usdAmount).toFixed(2)} ًں‡؛ًں‡¸</td>
                <td>أ— {Number(item.customerRate).toFixed(4).replace(/0+$/,"").replace(/\.$/,"")} =</td>
                <td>{money(item.formulaResultCad)} ًں‡¨ًں‡¦</td>
              </tr>)
              :<tr><td colSpan="4">ظ„ط§ طھظˆط¬ط¯ ط­ظˆط§ظ„ط§طھ ظپظٹ ظ‡ط°ظ‡ ط§ظ„ظپطھط±ط©.</td></tr>
            }
          </tbody>
        </table>
      </div>


      <div className="simple-statement-old-balance">
        <span>ط§ظ„ط­ط³ط§ط¨ ط§ظ„ظ‚ط¯ظٹظ…:</span>
        <strong>{money(data.totals.oldBalance||0)} ًں‡¨ًں‡¦</strong>
      </div>
      <div className="simple-statement-payments">
        <span>ط§ظ„ط¯ظپط¹ط§طھ:</span>
        <strong>{money(data.totals.paid||0)} ًں‡¨ًں‡¦</strong>
      </div>
      <div className="simple-statement-total">
        <span>ط§ظ„ظ…ط¬ظ…ظˆط¹ ط§ظ„ظ†ظ‡ط§ط¦ظٹ:</span>
        <strong>{money(Math.max(
          Number(data.totals.formulaResultCad ?? data.transactions.reduce((sum,item)=>sum+Number(item.formulaResultCad||0),0))
          - Number(data.totals.paid||0),
          0
        ))} ًں‡¨ًں‡¦</strong>
      </div>
    </section>}
  </>;
}

function Transactions({openInvoice}){
  const [customers,setCustomers]=useState([]);
  const [list,setList]=useState([]);
  const [error,setError]=useState("");
  const [f,setF]=useState({
    customerId:"",
    currency:"USD",
    amount:"",
    costRate:"",
    finalRate:"",
    transferFee:"0",
    feeMethod:"ADD",
    transferDate:new Date().toISOString().slice(0,10),
    rateMode:"auto",
    rateSource:"exchange-rates",
    rateUpdatedAt:null
  });
  const [rateMeta,setRateMeta]=useState(null);
  const [editingTransaction,setEditingTransaction]=useState(null);
  const [editSaving,setEditSaving]=useState(false);

  async function load(){
    try{
      const [customersResponse,transactionsResponse]=await Promise.all([
        api.get("/customers"),
        api.get("/transactions")
      ]);
      const customerList=Array.isArray(customersResponse.data)?customersResponse.data:[];
      setCustomers(customerList);
      setList(Array.isArray(transactionsResponse.data)?transactionsResponse.data:[]);
      if(!f.customerId&&customerList[0]){
        setF(current=>({...current,customerId:customerList[0].id}));
      }
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± طھط­ظ…ظٹظ„ ط§ظ„ط­ظˆط§ظ„ط§طھ");
    }
  }

  useEffect(()=>{load();},[]);

  useEffect(()=>{
    if(!f.currency)return;

    if(f.currency==="CAD"){
      const timestamp=new Date().toISOString();
      setRateMeta({baseCurrency:"CAD",quoteCurrency:"CAD",buyRate:1,createdAt:timestamp});
      if(f.rateMode==="auto"){
        setF(current=>({...current,costRate:"1",rateUpdatedAt:timestamp,rateSource:"base"}));
      }
      return;
    }

    api.get("/exchange-rates")
      .then(response=>{
        const rates=Array.isArray(response.data)?response.data:[];
        const direct=rates.find(item=>
          String(item.baseCurrency||"").toUpperCase()===f.currency &&
          String(item.quoteCurrency||"").toUpperCase()==="CAD"
        );
        setRateMeta(direct||null);
        const rate=Number(direct?.buyRate||direct?.sellRate||0);
        if(rate>0&&f.rateMode==="auto"){
          setF(current=>({...current,costRate:String(rate),rateUpdatedAt:direct.createdAt||null,rateSource:"exchange-rates"}));
        }else if(!direct&&f.rateMode==="auto"){
          setF(current=>({...current,costRate:"",rateUpdatedAt:null}));
        }
      })
      .catch(()=>{
        setRateMeta(null);
        if(f.rateMode==="auto"){
          setF(current=>({...current,costRate:"",rateUpdatedAt:null}));
        }
      });
  },[f.currency,f.rateMode]);


  async function add(event){
    event.preventDefault();
    setError("");
    try{
      await api.post("/transactions",{
        ...f,
        amount:Number(f.amount),
        costRate:Number(f.costRate),
        finalRate:Number(f.finalRate),
        transferFee:Number(f.transferFee||0),
        rateSource:f.rateMode==="auto"?"exchange-rates":"manual",
        rateUpdatedAt:f.rateUpdatedAt||rateMeta?.createdAt||null
      });
      setF(current=>({
        ...current,
        amount:"",
        finalRate:"",
        transferFee:"0",
        transferDate:new Date().toISOString().slice(0,10),
        paymentStatus:"UNPAID"
      }));
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± ط­ظپط¸ ط§ظ„ط­ظˆط§ظ„ط©");
    }
  }

  function startEditTransaction(transaction){
    setError("");
    setEditingTransaction({
      ...transaction,
      amount:String(transaction.amount??""),
      costRate:String(transaction.costRate??""),
      finalRate:String(transaction.finalRate??""),
      transferFee:String(transaction.transferFee??0),
      feeMethod:transaction.feeMethod||"ADD",
      currency:transaction.currency||"USD",
      transferDate:transaction.transferDate||String(transaction.createdAt||"").slice(0,10)
    });
  }

  async function saveEditedTransaction(event){
    event.preventDefault();
    if(!editingTransaction)return;
    setError("");
    setEditSaving(true);
    try{
      await api.patch(`/transactions/${editingTransaction.id}`,{
        currency:editingTransaction.currency,
        amount:Number(editingTransaction.amount),
        costRate:Number(editingTransaction.costRate),
        finalRate:Number(editingTransaction.finalRate),
        transferFee:Number(editingTransaction.transferFee||0),
        feeMethod:editingTransaction.feeMethod,
        transferDate:editingTransaction.transferDate,
        status:editingTransaction.status||"COMPLETED",
        rateSource:"manual"
      });
      setEditingTransaction(null);
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± طھط¹ط¯ظٹظ„ ط§ظ„ط­ظˆط§ظ„ط©");
    }finally{
      setEditSaving(false);
    }
  }


  async function markTransactionPaid(transaction){
    const remaining=Number(transaction.remaining||0);
    if(remaining<=0)return;
    setError("");
    try{
      await api.post(`/transactions/${transaction.id}/payments`,{
        amount:remaining,
        method:"CASH",
        notes:"طھط³ط¯ظٹط¯ ظƒط§ظ…ظ„ ظ„ظ„ط­ظˆط§ظ„ط©",
        paymentDate:new Date().toISOString().slice(0,10)
      });
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± طھط³ط¬ظٹظ„ ط§ظ„ط­ظˆط§ظ„ط© ظƒظ…ط¯ظپظˆط¹ط©");
    }
  }

  return <>
    <h2>ط§ظ„ط­ظˆط§ظ„ط§طھ</h2>
    {error&&<div className="card customer-error">{error}</div>}
    <form className="card form" onSubmit={add}>
      <select value={f.customerId} onChange={e=>setF({...f,customerId:e.target.value})} required>
        <option value="">ط§ظ„ط¹ظ…ظٹظ„</option>
        {customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}
      </select>
      <input type="date" value={f.transferDate} onChange={e=>setF({...f,transferDate:e.target.value})} required/>
      <label className="currency-field">
        <span className="currency-field-title">ط¹ظ…ظ„ط© ط§ظ„ط­ظˆط§ظ„ط©</span>
        <span className="currency-badge">{f.currency}</span>
        <select value={f.currency} onChange={e=>setF({...f,currency:e.target.value,costRate:"",finalRate:"",rateUpdatedAt:null})}>
          {["USD","EUR","SYP","AED","GBP","CAD"].map(code=><option key={code} value={code}>{code}</option>)}
        </select>
        <small>ط³ط¹ط± ط§ظ„طھظƒظ„ظپط© ظٹظڈط¬ظ„ط¨ ظ…ظ‚ط§ط¨ظ„ CAD</small>
      </label>
      <label className="currency-field">
        <span className="currency-field-title">ظ…ط¨ظ„ط؛ ط§ظ„ط­ظˆط§ظ„ط©</span>
        <span className="currency-badge">{f.currency}</span>
        <input type="number" inputMode="decimal" step=".01" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})} placeholder="0.00" required/>
        <small>ط§ظ„ظ…ط¨ظ„ط؛ ط¨ط¹ظ…ظ„ط© {f.currency}</small>
      </label>
      <label className="currency-field">
        <span className="currency-field-title">ط³ط¹ط± ط§ظ„طھظƒظ„ظپط© ظ…ظ‚ط§ط¨ظ„ CAD</span>
        <span className="currency-badge cad">CAD</span>
        <div className="rate-mode-switch">
          <button type="button" className={f.rateMode==="auto"?"active":""} onClick={()=>setF({...f,rateMode:"auto"})}>ط§ظ„ط³ط¹ط± ط§ظ„ط¢ظ„ظٹ</button>
          <button type="button" className={f.rateMode==="manual"?"active":""} onClick={()=>setF({...f,rateMode:"manual"})}>ط³ط¹ط± ظٹط¯ظˆظٹ</button>
        </div>
        <input type="number" inputMode="decimal" step=".0000001" value={f.costRate} onChange={e=>setF({...f,costRate:e.target.value,rateMode:"manual"})} placeholder="0.0000" required readOnly={f.rateMode==="auto"}/>
        <small>{(rateMeta?.createdAt||rateMeta?.updatedAt)?`ط¢ط®ط± طھط­ط¯ظٹط«: ${new Date(rateMeta.createdAt||rateMeta.updatedAt).toLocaleString("ar-CA")}`:(f.rateMode==="manual"?"ظٹظڈط³طھط®ط¯ظ… ظ‡ط°ط§ ط§ظ„ط³ط¹ط± ظ„ظ‡ط°ظ‡ ط§ظ„ط­ظˆط§ظ„ط© ظپظ‚ط·":"ظ„ط§ ظٹظˆط¬ط¯ ط³ط¹ط± ط¢ظ„ظٹط› ط§ط®طھط± ط³ط¹ط± ظٹط¯ظˆظٹ")}</small>
      </label>
      <label className="currency-field">
        <span className="currency-field-title">ط³ط¹ط± ط§ظ„طھط­ظˆظٹظ„ ظ„ظ„ط¹ظ…ظٹظ„</span>
        <span className="currency-badge cad">CAD</span>
        <input type="number" inputMode="decimal" step=".0000001" value={f.finalRate} onChange={e=>setF({...f,finalRate:e.target.value})} placeholder="0.0000" required/>
        <small>ط§ظ„ط³ط¹ط± ط§ظ„ظ…ط­ط³ظˆط¨ ظ„ظ„ط¹ظ…ظٹظ„ ظ…ظ‚ط§ط¨ظ„ ظƒظ„ ظˆط­ط¯ط© ظ…ظ† {f.currency}</small>
      </label>
      <div className="transfer-calculation-grid">
        <div className="transfer-total-preview">
          <span>ط§ظ„ظ…ط¬ظ…ظˆط¹ ط§ظ„ظ†ظ‡ط§ط¦ظٹ ظ„ظ„ط¹ظ…ظٹظ„</span>
          <strong>{((Number(f.amount)||0)*(Number(f.finalRate)||0)+(Number(f.transferFee)||0)).toFixed(2)} CAD</strong>
        </div>
        <div className="transfer-profit-preview">
          <span>ط±ط¨ط­ ط§ظ„ط­ظˆط§ظ„ط©</span>
          <strong>{((Number(f.amount)||0)*((Number(f.finalRate)||0)-(Number(f.costRate)||0))+(Number(f.transferFee)||0)).toFixed(2)} CAD</strong>
        </div>
      </div>
      <label className="currency-field">
        <span className="currency-field-title">ط£ط¬ظˆط± ط§ظ„ط­ظˆط§ظ„ط©</span>
        <span className="currency-badge cad">CAD</span>
        <input type="number" inputMode="decimal" step=".01" value={f.transferFee} onChange={e=>setF({...f,transferFee:e.target.value})} placeholder="0.00"/>
      </label>
      <select value={f.feeMethod} onChange={e=>setF({...f,feeMethod:e.target.value})}>
        <option value="ADD">ط¥ط¶ط§ظپط© ط§ظ„ط£ط¬ظˆط±</option>
        <option value="DEDUCT">ط®طµظ… ط§ظ„ط£ط¬ظˆط±</option>
      </select>

      <div className="transfer-payment-choice">
        <div className="transfer-payment-choice-title">
          <strong>ط­ط§ظ„ط© ط¯ظپط¹ ط§ظ„ط­ظˆط§ظ„ط©</strong>
          <small>ط§ظ„ط­ظˆط§ظ„ط© ط؛ظٹط± ط§ظ„ظ…ط¯ظپظˆط¹ط© طھظڈط­طھط³ط¨ طھظ„ظ‚ط§ط¦ظٹظ‹ط§ ط¶ظ…ظ† ط±طµظٹط¯ آ«ط§ظ„ط¯ظٹظ† ظ„ظ†ط§آ».</small>
        </div>
        <div className="transfer-payment-choice-buttons">
          <button type="button" className={f.paymentStatus==="PAID"?"is-active paid":""} onClick={()=>setF({...f,paymentStatus:"PAID"})}>âœ“ ظ…ط¯ظپظˆط¹</button>
          <button type="button" className={f.paymentStatus==="UNPAID"?"is-active unpaid":""} onClick={()=>setF({...f,paymentStatus:"UNPAID"})}>â—· ط؛ظٹط± ظ…ط¯ظپظˆط¹</button>
        </div>
      </div>

      <button>ط­ظپط¸</button>
    </form>

    {editingTransaction&&
      <form className="card form edit-panel transaction-edit-panel no-print" onSubmit={saveEditedTransaction}>
        <div className="transaction-edit-title">
          <h3>âœڈï¸ڈ طھط¹ط¯ظٹظ„ ط§ظ„ط­ظˆط§ظ„ط©</h3>
          <small>{editingTransaction.number}</small>
        </div>

        <label className="currency-field">
          <span className="currency-field-title">ط¹ظ…ظ„ط© ط§ظ„ط­ظˆط§ظ„ط©</span>
          <select value={editingTransaction.currency} onChange={e=>setEditingTransaction({...editingTransaction,currency:e.target.value})}>
            {["USD","EUR","SYP","AED","GBP","CAD"].map(code=><option key={code} value={code}>{code}</option>)}
          </select>
        </label>

        <label className="currency-field">
          <span className="currency-field-title">ظ…ط¨ظ„ط؛ ط§ظ„ط­ظˆط§ظ„ط©</span>
          <input type="number" inputMode="decimal" step=".01" value={editingTransaction.amount} onChange={e=>setEditingTransaction({...editingTransaction,amount:e.target.value})} required/>
        </label>

        <label className="currency-field">
          <span className="currency-field-title">ط³ط¹ط± ط§ظ„طھظƒظ„ظپط©</span>
          <input type="number" inputMode="decimal" step=".0000001" value={editingTransaction.costRate} onChange={e=>setEditingTransaction({...editingTransaction,costRate:e.target.value})} required/>
        </label>

        <label className="currency-field">
          <span className="currency-field-title">ط³ط¹ط± ط§ظ„طھط­ظˆظٹظ„ ظ„ظ„ط¹ظ…ظٹظ„</span>
          <input type="number" inputMode="decimal" step=".0000001" value={editingTransaction.finalRate} onChange={e=>setEditingTransaction({...editingTransaction,finalRate:e.target.value})} required/>
        </label>

        <label className="currency-field">
          <span className="currency-field-title">ط£ط¬ظˆط± ط§ظ„ط­ظˆط§ظ„ط©</span>
          <input type="number" inputMode="decimal" step=".01" value={editingTransaction.transferFee} onChange={e=>setEditingTransaction({...editingTransaction,transferFee:e.target.value})}/>
        </label>

        <select value={editingTransaction.feeMethod} onChange={e=>setEditingTransaction({...editingTransaction,feeMethod:e.target.value})}>
          <option value="ADD">ط¥ط¶ط§ظپط© ط§ظ„ط£ط¬ظˆط±</option>
          <option value="DEDUCT">ط®طµظ… ط§ظ„ط£ط¬ظˆط±</option>
        </select>

        <input type="date" value={editingTransaction.transferDate||""} onChange={e=>setEditingTransaction({...editingTransaction,transferDate:e.target.value})}/>

        <div className="transaction-edit-preview">
          <span>ط§ظ„ظ…ط¬ظ…ظˆط¹ ط¨ط¹ط¯ ط§ظ„طھط¹ط¯ظٹظ„</span>
          <strong>{(
            (Number(editingTransaction.amount)||0)*(Number(editingTransaction.finalRate)||0)
            +(editingTransaction.feeMethod==="ADD"?(Number(editingTransaction.transferFee)||0):0)
          ).toFixed(2)} CAD</strong>
        </div>

        <div className="transaction-edit-actions">
          <button disabled={editSaving}>{editSaving?"ط¬ط§ط±ظٹ ط§ظ„ط­ظپط¸...":"ط­ظپط¸ طھط¹ط¯ظٹظ„ ط§ظ„ط­ظˆط§ظ„ط©"}</button>
          <button type="button" onClick={()=>setEditingTransaction(null)}>ط¥ظ„ط؛ط§ط،</button>
        </div>
      </form>
    }

    <div className="card tablewrap">
      <table>
        <thead>
          <tr>
            <th>ط§ظ„ط±ظ‚ظ…</th><th>طھط§ط±ظٹط® ط§ظ„ط­ظˆط§ظ„ط©</th><th>ط§ظ„ط¹ظ…ظٹظ„</th><th>ط§ظ„ظ…ط¨ظ„ط؛</th>
            <th>ط§ظ„ط£ط¬ظˆط±</th><th>ط§ظ„ط¥ط¬ظ…ط§ظ„ظٹ</th><th>ط­ط§ظ„ط© ط§ظ„ط¯ظپط¹</th><th>ط§ظ„ظ…طھط¨ظ‚ظٹ</th><th>ط§ظ„ط±ط¨ط­</th><th>ط§ظ„ظپط§طھظˆط±ط©</th><th>طھط¹ط¯ظٹظ„</th>
          </tr>
        </thead>
        <tbody>
          {list.length?list.map(transaction=><tr key={transaction.id}>
            <td>{transaction.number}</td>
            <td>{transaction.transferDate||String(transaction.createdAt||"").slice(0,10)||"-"}</td>
            <td>{transaction.customerName}</td>
            <td>{money(transaction.amount)}</td>
            <td>{money(transaction.transferFee)}</td>
            <td>{money(transaction.totalCustomerDue)}</td>
            <td>
              <span className={`transfer-payment-badge ${transaction.paymentStatus==="PAID"?"paid":"unpaid"}`}>
                {transaction.paymentStatus==="PAID"?"ظ…ط¯ظپظˆط¹":"ط؛ظٹط± ظ…ط¯ظپظˆط¹"}
              </span>
            </td>
            <td>
              <div className="transfer-remaining-cell">
                <strong>{money(transaction.remaining||0)}</strong>
                {transaction.paymentStatus!=="PAID"&&
                  <button type="button" onClick={()=>markTransactionPaid(transaction)}>طھط³ط¯ظٹط¯ ظƒط§ظ…ظ„</button>
                }
              </div>
            </td>
            <td>{money(transaction.totalProfit)}</td>
            <td><button onClick={()=>openInvoice(transaction.id)}>ظپطھط­</button></td>
            <td><button className="transaction-edit-button" onClick={()=>startEditTransaction(transaction)}>âœڈï¸ڈ طھط¹ط¯ظٹظ„</button></td>
          </tr>):<tr><td colSpan="9">ظ„ط§ طھظˆط¬ط¯ ط­ظˆط§ظ„ط§طھ.</td></tr>}
        </tbody>
      </table>
    </div>
  </>;
}

function Profits(){
  const [data,setData]=useState(null);
  const [filters,setFilters]=useState({from:"",to:""});
  const load=()=>api.get("/profits",{params:filters}).then(r=>setData(r.data));
  useEffect(()=>{load();},[]);
  if(!data)return <p>ط¬ط§ط±ظٹ طھط­ظ…ظٹظ„ ط§ظ„ط£ط±ط¨ط§ط­...</p>;
  return <>
    <h2>ط§ظ„ط£ط±ط¨ط§ط­</h2>
    <div className="card form">
      <input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})}/>
      <input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})}/>
      <button type="button" onClick={load}>ط¹ط±ط¶ ط§ظ„طھظ‚ط±ظٹط±</button>
    </div>
    <div className="stats">
      <div className="card"><span>ط¹ط¯ط¯ ط§ظ„ط­ظˆط§ظ„ط§طھ</span><strong>{data.transactionCount}</strong></div>
      <div className="card"><span>ط±ط¨ط­ ظپط±ظ‚ ط§ظ„ط³ط¹ط±</span><strong>{money(data.exchangeProfit)}</strong></div>
      <div className="card"><span>ط£ط¬ظˆط± ط§ظ„ط­ظˆط§ظ„ط§طھ</span><strong>{money(data.transferFees)}</strong></div>
      <div className="card"><span>ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط±ط¨ط­</span><strong>{money(data.grossProfit)}</strong></div>
      <div className="card"><span>ط§ظ„ظ…طµط±ظˆظپط§طھ</span><strong>{money(data.expenses)}</strong></div>
      <div className="card final"><span>طµط§ظپظٹ ط§ظ„ط±ط¨ط­</span><strong>{money(data.netProfit)}</strong></div>
    </div>
    <div className="card tablewrap">
      <h3>ط§ظ„ط£ط±ط¨ط§ط­ ط§ظ„ط´ظ‡ط±ظٹط©</h3>
      <table>
        <thead><tr><th>ط§ظ„ط´ظ‡ط±</th><th>ظپط±ظ‚ ط§ظ„ط³ط¹ط±</th><th>ط£ط¬ظˆط± ط§ظ„ط­ظˆط§ظ„ط§طھ</th><th>ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط±ط¨ط­</th><th>ط§ظ„ظ…طµط±ظˆظپط§طھ</th><th>طµط§ظپظٹ ط§ظ„ط±ط¨ط­</th></tr></thead>
        <tbody>{data.monthly.map(x=><tr key={x.month}>
          <td>{x.month}</td>
          <td>{money(x.exchangeProfit)}</td>
          <td>{money(x.transferFees)}</td>
          <td>{money(x.grossProfit)}</td>
          <td>{money(x.expenses)}</td>
          <td><b>{money(x.netProfit)}</b></td>
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}

function ExchangeRates(){
  const [list,setList]=useState([]);
  const [history,setHistory]=useState([]);
  const [f,setF]=useState({baseCurrency:"CAD",quoteCurrency:"USD",buyRate:"",sellRate:"",notes:""});
  const [goldForm,setGoldForm]=useState({baseCurrency:"XAU24",quoteCurrency:"CAD",buyRate:"",sellRate:"",notes:"ط³ط¹ط± ط؛ط±ط§ظ… ط§ظ„ط°ظ‡ط¨"});
  const [refreshing,setRefreshing]=useState(false);
  const [message,setMessage]=useState("");

  const trendFor=(rate)=>rateTrend(rate,history);
  const isGoldRate=rate=>String(rate.baseCurrency||"").startsWith("XAU");
  const goldLabel=code=>({
    XAU24:"ط°ظ‡ط¨ 24 ظ‚ظٹط±ط§ط·",
    XAU22:"ط°ظ‡ط¨ 22 ظ‚ظٹط±ط§ط·",
    XAU21:"ط°ظ‡ط¨ 21 ظ‚ظٹط±ط§ط·",
    XAU18:"ط°ظ‡ط¨ 18 ظ‚ظٹط±ط§ط·"
  }[code]||code);

  const normalizeRatesPayload=(payload)=>{
    if(Array.isArray(payload))return payload;
    if(Array.isArray(payload?.rows))return payload.rows;
    if(Array.isArray(payload?.rates))return payload.rates;
    if(Array.isArray(payload?.data))return payload.data;
    return [];
  };
  const safeDateText=(value)=>{
    const date=new Date(value||Date.now());
    return Number.isNaN(date.getTime())?"â€”":date.toLocaleString("ar-CA");
  };
  const currencyInfo={
    CAD:{name:"ط§ظ„ط¯ظˆظ„ط§ط± ط§ظ„ظƒظ†ط¯ظٹ",flag:"ًں‡¨ًں‡¦"},USD:{name:"ط§ظ„ط¯ظˆظ„ط§ط± ط§ظ„ط£ظ…ط±ظٹظƒظٹ",flag:"ًں‡؛ًں‡¸"},
    EUR:{name:"ط§ظ„ظٹظˆط±ظˆ",flag:"ًں‡ھًں‡؛"},SYP:{name:"ط§ظ„ظ„ظٹط±ط© ط§ظ„ط³ظˆط±ظٹط©",flag:"ًں‡¸ًں‡¾"},
    AED:{name:"ط§ظ„ط¯ط±ظ‡ظ… ط§ظ„ط¥ظ…ط§ط±ط§طھظٹ",flag:"ًں‡¦ًں‡ھ"},GBP:{name:"ط§ظ„ط¬ظ†ظٹظ‡ ط§ظ„ط¥ط³طھط±ظ„ظٹظ†ظٹ",flag:"ًں‡¬ًں‡§"},
    TRY:{name:"ط§ظ„ظ„ظٹط±ط© ط§ظ„طھط±ظƒظٹط©",flag:"ًں‡¹ًں‡·"}
  };
  const currencyLabel=(code)=>`${currencyInfo[code]?.flag||"ًںڈ³ï¸ڈ"} ${currencyInfo[code]?.name||code} (${code})`;

  const load=async()=>{
    setMessage("");
    try{
      const [ratesResponse,historyResponse]=await Promise.all([
        api.get("/exchange-rates"),
        api.get("/exchange-rates/history").catch(()=>({data:[]}))
      ]);
      setList(normalizeRatesPayload(ratesResponse.data));
      setHistory(normalizeRatesPayload(historyResponse.data));
    }catch(error){
      setList([]);setHistory([]);
      setMessage(error.response?.data?.message||"طھط¹ط°ط± طھط­ظ…ظٹظ„ ط£ط³ط¹ط§ط± ط§ظ„طµط±ظپ. ط­ط§ظˆظ„ ط§ظ„طھط­ط¯ظٹط« ظ…ط±ط© ط£ط®ط±ظ‰.");
    }
  };

  useEffect(()=>{
    load();
    const hourly=setInterval(async()=>{
      try{await api.post("/exchange-rates/refresh")}catch{}
      await load();
    },60*60*1000);
    return ()=>clearInterval(hourly);
  },[]);

  async function add(e){
    e.preventDefault();
    setMessage("");
    try{
      await api.post("/exchange-rates",f);
      setF(x=>({...x,buyRate:"",sellRate:"",notes:""}));
      setMessage("طھظ… ط­ظپط¸ ط³ط¹ط± ط§ظ„ط¹ظ…ظ„ط©");
      await load();
    }catch(error){
      setMessage(error.response?.data?.message||"طھط¹ط°ط± ط­ظپط¸ ط³ط¹ط± ط§ظ„ط¹ظ…ظ„ط©");
    }
  }

  async function addGold(e){
    e.preventDefault();
    setMessage("");
    try{
      await api.post("/exchange-rates",goldForm);
      setGoldForm(x=>({...x,buyRate:"",sellRate:""}));
      setMessage("طھظ… ط­ظپط¸ ط³ط¹ط± ط§ظ„ط°ظ‡ط¨");
      await load();
    }catch(error){
      setMessage(error.response?.data?.message||"طھط¹ط°ط± ط­ظپط¸ ط³ط¹ط± ط§ظ„ط°ظ‡ط¨");
    }
  }

  async function refresh(){
    setRefreshing(true);setMessage("");
    try{
      const {data}=await api.post("/exchange-rates/refresh");
      setMessage(data.message);
      await load();
    }catch(e){
      setMessage(e.response?.data?.message||"طھط¹ط°ط± ط§ظ„طھط­ط¯ظٹط« ط§ظ„طھظ„ظ‚ط§ط¦ظٹ");
    }finally{setRefreshing(false)}
  }

  const storedCurrencyRates=list.filter(rate=>!isGoldRate(rate));
  const hasSyrianPound=storedCurrencyRates.some(rate=>rate.baseCurrency==="SYP"||rate.quoteCurrency==="SYP");
  const currencyRates=hasSyrianPound?storedCurrencyRates:[
    ...storedCurrencyRates,
    {
      id:"syp-visible-placeholder",
      baseCurrency:"USD",
      quoteCurrency:"SYP",
      buyRate:0,
      sellRate:0,
      source:"MANUAL",
      createdAt:new Date().toISOString(),
      sypPlaceholder:true
    }
  ];
  const goldRates=list.filter(isGoldRate);

  return <>
    <h2>ط§ظ„ط¹ظ…ظ„ط§طھ ظˆط£ط³ط¹ط§ط± ط§ظ„طµط±ظپ ظˆط§ظ„ط°ظ‡ط¨</h2>

    <div className="card rate-legend">
      <span className="legend-up">â†‘ ط§ط±طھظپط§ط¹</span>
      <span className="legend-down">â†“ ط§ظ†ط®ظپط§ط¶</span>
      <span className="legend-same">â†’ ط«ط§ط¨طھ</span>
      <span className="legend-new">â—ڈ ط³ط¹ط± ط¬ط¯ظٹط¯</span>
    </div>

    <div className="card auto-rate-bar">
      <div>
        <strong>ط§ظ„طھط­ط¯ظٹط« ط§ظ„طھظ„ظ‚ط§ط¦ظٹ ظ„ظ„ط¹ظ…ظ„ط§طھ</strong>
        <p>ط§ظ„ط¹ظ…ظ„ط§طھ ظˆط§ظ„ظ„ظٹط±ط© ط§ظ„ط³ظˆط±ظٹط© ظˆط£ط³ط¹ط§ط± ط§ظ„ط°ظ‡ط¨ طھطھط­ط¯ط« طھظ„ظ‚ط§ط¦ظٹظ‹ط§ ظƒظ„ ط³ط§ط¹ط©. ظٹط¨ظ‚ظ‰ ط¢ط®ط± ط³ط¹ط± ظ…ط­ظپظˆط¸ ط¥ط°ط§ طھط¹ط°ط± ط£ط­ط¯ ط§ظ„ظ…طµط§ط¯ط±.</p>
      </div>
      <button type="button" onClick={refresh} disabled={refreshing}>
        {refreshing?"ط¬ط§ط±ظٹ ط§ظ„طھط­ط¯ظٹط«...":"طھط­ط¯ظٹط« ط£ط³ط¹ط§ط± ط§ظ„ط¹ظ…ظ„ط§طھ ط§ظ„ط¢ظ†"}
      </button>
    </div>

    {message&&<div className="card rate-message">{message}</div>}

    <div className="rates-entry-grid">
      <form className="card form" onSubmit={add}>
        <h3>ًں’± ط¥ط¶ط§ظپط© ط³ط¹ط± ط¹ظ…ظ„ط©</h3>
        <select value={f.baseCurrency} onChange={e=>setF({...f,baseCurrency:e.target.value})}>
          {["CAD","USD","EUR","SYP","AED","GBP","TRY"].map(x=><option key={x} value={x}>{currencyLabel(x)}</option>)}
        </select>
        <select value={f.quoteCurrency} onChange={e=>setF({...f,quoteCurrency:e.target.value})}>
          {["USD","CAD","EUR","SYP","AED","GBP","TRY"].map(x=><option key={x} value={x}>{currencyLabel(x)}</option>)}
        </select>
        <input type="number" step=".000001" value={f.buyRate} onChange={e=>setF({...f,buyRate:e.target.value})} placeholder="ط³ط¹ط± ط§ظ„ط´ط±ط§ط،" required/>
        <input type="number" step=".000001" value={f.sellRate} onChange={e=>setF({...f,sellRate:e.target.value})} placeholder="ط³ط¹ط± ط§ظ„ط¨ظٹط¹" required/>
        <input value={f.notes} onChange={e=>setF({...f,notes:e.target.value})} placeholder="ظ…ظ„ط§ط­ط¸ط§طھ"/>
        <button>ط­ظپط¸ ط³ط¹ط± ط§ظ„ط¹ظ…ظ„ط©</button>
      </form>

      <form className="card form gold-rate-form" onSubmit={addGold}>
        <h3>ًںھ™ ط¥ط¶ط§ظپط© ط³ط¹ط± ط§ظ„ط°ظ‡ط¨ ظ„ظ„ط؛ط±ط§ظ…</h3>
        <select value={goldForm.baseCurrency} onChange={e=>setGoldForm({...goldForm,baseCurrency:e.target.value})}>
          <option value="XAU24">ط°ظ‡ط¨ 24 ظ‚ظٹط±ط§ط·</option>
          <option value="XAU22">ط°ظ‡ط¨ 22 ظ‚ظٹط±ط§ط·</option>
          <option value="XAU21">ط°ظ‡ط¨ 21 ظ‚ظٹط±ط§ط·</option>
          <option value="XAU18">ط°ظ‡ط¨ 18 ظ‚ظٹط±ط§ط·</option>
        </select>
        <select value={goldForm.quoteCurrency} onChange={e=>setGoldForm({...goldForm,quoteCurrency:e.target.value})}>
          <option value="CAD">CAD ًں‡¨ًں‡¦</option>
          <option value="USD">USD ًں‡؛ًں‡¸</option>
          <option value="SYP">SYP ًں‡¸ًں‡¾</option>
        </select>
        <input type="number" step=".01" value={goldForm.buyRate} onChange={e=>setGoldForm({...goldForm,buyRate:e.target.value})} placeholder="ط³ط¹ط± ط´ط±ط§ط، ط§ظ„ط؛ط±ط§ظ…" required/>
        <input type="number" step=".01" value={goldForm.sellRate} onChange={e=>setGoldForm({...goldForm,sellRate:e.target.value})} placeholder="ط³ط¹ط± ط¨ظٹط¹ ط§ظ„ط؛ط±ط§ظ…" required/>
        <input value={goldForm.notes} onChange={e=>setGoldForm({...goldForm,notes:e.target.value})} placeholder="ظ…ظ„ط§ط­ط¸ط§طھ"/>
        <button>ط­ظپط¸ ط³ط¹ط± ط§ظ„ط°ظ‡ط¨</button>
      </form>
    </div>

    <div className="card tablewrap currency-rates-table">
      <h3>ًں’± ط£ط³ط¹ط§ط± ط§ظ„ط¹ظ…ظ„ط§طھ</h3>
      <table>
        <thead><tr><th>ظ…ظ†</th><th>ط¥ظ„ظ‰</th><th>ط´ط±ط§ط،</th><th>ط¨ظٹط¹</th><th>ط§ظ„ط­ط±ظƒط©</th><th>ط§ظ„ظ…طµط¯ط±</th><th>ط¢ط®ط± طھط­ط¯ظٹط«</th></tr></thead>
        <tbody>{currencyRates.length?currencyRates.map(r=>{
          const trend=trendFor(r);
          return <tr key={r.id} className={`rate-row rate-${trend.type} ${r.baseCurrency==="SYP"||r.quoteCurrency==="SYP"?"syp-highlight":""}`}>
            <td><span className="currency-badge currency-with-flag"><CurrencyFlag code={r.baseCurrency}/><span>{currencyInfo[r.baseCurrency]?.name||r.baseCurrency}</span><small>{r.baseCurrency}</small></span></td>
            <td><span className="currency-badge currency-with-flag"><CurrencyFlag code={r.quoteCurrency}/><span>{currencyInfo[r.quoteCurrency]?.name||r.quoteCurrency}</span><small>{r.quoteCurrency}</small></span></td>
            <td className="buy-rate">{r.sypPlaceholder?"ط£ط¯ط®ظ„ ط§ظ„ط³ط¹ط±":Number(r.buyRate).toFixed(6).replace(/0+$/,"").replace(/\.$/,"")}</td>
            <td className="sell-rate"><strong>{r.sypPlaceholder?"ط£ط¯ط®ظ„ ط§ظ„ط³ط¹ط±":Number(r.sellRate).toFixed(6).replace(/0+$/,"").replace(/\.$/,"")}</strong></td>
            <td><span className={`trend trend-${r.sypPlaceholder?"new":trend.type}`}>{r.sypPlaceholder?"â—ڈ ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ط³ط¹ط±":`${trend.symbol} ${trend.label}`}</span></td>
            <td><span className={`source-badge ${["FRANKFURTER","EXCHANGE_RATE_API","GOLD_API"].includes(r.source)?"auto":"manual"}`}>{r.sypPlaceholder?"ط³ظˆط±ظٹ":r.source==="FRANKFURTER"?"طھظ„ظ‚ط§ط¦ظٹ":"ظٹط¯ظˆظٹ"}</span></td>
            <td>{safeDateText(r.createdAt)}</td>
          </tr>
        }):<tr><td colSpan="7">ظ„ط§ طھظˆط¬ط¯ ط£ط³ط¹ط§ط± ط¹ظ…ظ„ط§طھ ظ…ط³ط¬ظ„ط©.</td></tr>}</tbody>
      </table>
    </div>

    <div className="card tablewrap gold-rates-table">
      <h3>ًںھ™ ط£ط³ط¹ط§ط± ط§ظ„ط°ظ‡ط¨ ظ„ظ„ط؛ط±ط§ظ…</h3>
      <table>
        <thead><tr><th>ط§ظ„ط¹ظٹط§ط±</th><th>ط§ظ„ط¹ظ…ظ„ط©</th><th>ط´ط±ط§ط، ط§ظ„ط؛ط±ط§ظ…</th><th>ط¨ظٹط¹ ط§ظ„ط؛ط±ط§ظ…</th><th>ط§ظ„ط­ط±ظƒط©</th><th>ط¢ط®ط± طھط­ط¯ظٹط«</th></tr></thead>
        <tbody>{goldRates.length?goldRates.map(r=>{
          const trend=trendFor(r);
          return <tr key={r.id} className={`rate-row gold-rate-row rate-${trend.type}`}>
            <td><span className="gold-karat-badge">ًںھ™ {goldLabel(r.baseCurrency)}</span></td>
            <td><span className="currency-badge currency-with-flag"><CurrencyFlag code={r.quoteCurrency}/><span>{currencyInfo[r.quoteCurrency]?.name||r.quoteCurrency}</span><small>{r.quoteCurrency}</small></span></td>
            <td className="buy-rate">{money(r.buyRate)}</td>
            <td className="sell-rate"><strong>{money(r.sellRate)}</strong></td>
            <td><span className={`trend trend-${trend.type}`}>{trend.symbol} {trend.label}</span></td>
            <td>{safeDateText(r.createdAt)}</td>
          </tr>
        }):<tr><td colSpan="6">ظ„ط§ طھظˆط¬ط¯ ط£ط³ط¹ط§ط± ط°ظ‡ط¨ ظ…ط³ط¬ظ„ط©. ط£ط¶ظپ ط³ط¹ط± ط§ظ„ط°ظ‡ط¨ ظ…ظ† ط§ظ„ظ†ظ…ظˆط°ط¬ ط£ط¹ظ„ط§ظ‡.</td></tr>}</tbody>
      </table>
    </div>

    <div className="exchange-rates-summary">
      <div><span>ط¹ط¯ط¯ ط§ظ„ط¹ظ…ظ„ط§طھ</span><strong>{currencyRates.length}</strong><small>ط£ط²ظˆط§ط¬ ط¹ظ…ظ„ط§طھ ظ…ط³ط¬ظ„ط©</small></div>
      <div><span>ط£ظپط¶ظ„ ط³ط¹ط± ط§ظ„ظٹظˆظ…</span><strong>{currencyRates.length?`${currencyRates[0].baseCurrency}/${currencyRates[0].quoteCurrency}`:"â€”"}</strong><small>ط¢ط®ط± ط³ط¹ط± ظ…ط­ط¯ط«</small></div>
      <div><span>ظ…طھظˆط³ط· ط§ظ„طھط؛ظٹظٹط±</span><strong className="positive">+0.28%</strong><small>ظ…ط¤ط´ط± طھظ‚ط±ظٹط¨ظٹ</small></div>
      <div><span>ط§ظ„ط°ظ‡ط¨</span><strong>GOLD/CAD</strong><small>ط³ط¹ط± ظٹط¯ظˆظٹ</small></div>
    </div>

    <div className="card tablewrap">
      <h3>ط³ط¬ظ„ طھط؛ظٹظٹط±ط§طھ ط§ظ„ط£ط³ط¹ط§ط±</h3>
      <table>
        <thead><tr><th>ط§ظ„طھط§ط±ظٹط®</th><th>ط§ظ„ط²ظˆط¬ / ط§ظ„ط¹ظٹط§ط±</th><th>ط´ط±ط§ط،</th><th>ط¨ظٹط¹</th><th>ط§ظ„ظ…طµط¯ط±</th><th>ظ…ظ„ط§ط­ط¸ط§طھ</th></tr></thead>
        <tbody>{history.map(r=><tr key={r.id}>
          <td>{safeDateText(r.createdAt)}</td>
          <td>{isGoldRate(r)?goldLabel(r.baseCurrency):`${r.baseCurrency}/${r.quoteCurrency}`}</td>
          <td>{Number(r.buyRate).toFixed(6).replace(/0+$/,"").replace(/\.$/,"")}</td>
          <td>{Number(r.sellRate).toFixed(6).replace(/0+$/,"").replace(/\.$/,"")}</td>
          <td>{r.source==="FRANKFURTER"?"طھظ„ظ‚ط§ط¦ظٹ":r.source==="EXCHANGE_RATE_API"?"طھظ„ظ‚ط§ط¦ظٹ SYP":r.source==="GOLD_API"?"طھظ„ظ‚ط§ط¦ظٹ ط°ظ‡ط¨":"ظٹط¯ظˆظٹ"}</td>
          <td>{r.notes||"-"}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}


function GeneralDebts(){
  const [data,setData]=useState({rows:[],totals:{receivable:0,payable:0,net:0},totalsByCurrency:{}});
  const [filter,setFilter]=useState("");
  const [message,setMessage]=useState("");
  const [payment,setPayment]=useState({debtId:"",amount:"",paymentDate:"",notes:""});
  const [form,setForm]=useState({
    type:"RECEIVABLE",
    partyName:"",
    amount:"",
    currency:"CAD",
    dueDate:"",
    description:"",
    reference:""
  });

  async function load(){
    try{
      const {data}=await api.get("/general-debts",{params:{type:filter}});
      setData({
        rows:Array.isArray(data?.rows)?data.rows:[],
        totals:data?.totals||{receivable:0,payable:0,net:0},
        totalsByCurrency:data?.totalsByCurrency||{},
        automaticTransferDebts:Number(data?.automaticTransferDebts||0)
      });
    }catch(error){
      setMessage(error.response?.data?.message||"طھط¹ط°ط± طھط­ظ…ظٹظ„ ط§ظ„ط¯ظٹظˆظ†");
    }
  }

  useEffect(()=>{load();},[filter]);

  async function addDebt(event){
    event.preventDefault();
    setMessage("");
    try{
      await api.post("/general-debts",form);
      setForm({
        type:"RECEIVABLE",
        partyName:"",
        amount:"",
        currency:"CAD",
        dueDate:"",
        description:"",
        reference:""
      });
      setMessage("طھظ… ط­ظپط¸ ط§ظ„ط¯ظٹظ† ط¨ظ†ط¬ط§ط­");
      await load();
    }catch(error){
      setMessage(error.response?.data?.message||"طھط¹ط°ط± ط­ظپط¸ ط§ظ„ط¯ظٹظ†");
    }
  }

  async function addPayment(event){
    event.preventDefault();
    if(!payment.debtId||!payment.amount)return;
    setMessage("");
    try{
      await api.post(`/general-debts/${payment.debtId}/payments`,payment);
      setPayment({debtId:"",amount:"",paymentDate:"",notes:""});
      setMessage("طھظ… طھط³ط¬ظٹظ„ ط§ظ„ط¯ظپط¹ط©");
      await load();
    }catch(error){
      setMessage(error.response?.data?.message||"طھط¹ط°ط± طھط³ط¬ظٹظ„ ط§ظ„ط¯ظپط¹ط©");
    }
  }

  const openDebts=data.rows.filter(item=>item.source!=="TRANSFER"&&Number(item.remaining||0)>0);

  const statusLabel={
    OPEN:"ظ…ظپطھظˆط­",
    PARTIAL:"ظ…ط¯ظپظˆط¹ ط¬ط²ط¦ظٹظ‹ط§",
    PAID:"ظ…ط¯ظپظˆط¹",
    OVERDUE:"ظ…طھط£ط®ط±"
  };

  const debtCurrencies=[
    {code:"CAD",label:"ط§ظ„ط¯ظˆظ„ط§ط± ط§ظ„ظƒظ†ط¯ظٹ",flag:"ًں‡¨ًں‡¦"},
    {code:"USD",label:"ط§ظ„ط¯ظˆظ„ط§ط± ط§ظ„ط£ظ…ط±ظٹظƒظٹ",flag:"ًں‡؛ًں‡¸"},
    {code:"EUR",label:"ط§ظ„ظٹظˆط±ظˆ",flag:"ًں‡ھًں‡؛"},
    {code:"SYP",label:"ط§ظ„ظ„ظٹط±ط© ط§ظ„ط³ظˆط±ظٹط©",flag:"ًں‡¸ًں‡¾"},
    {code:"TRY",label:"ط§ظ„ظ„ظٹط±ط© ط§ظ„طھط±ظƒظٹط©",flag:"ًں‡¹ًں‡·"},
    {code:"SAR",label:"ط§ظ„ط±ظٹط§ظ„ ط§ظ„ط³ط¹ظˆط¯ظٹ",flag:"ًں‡¸ًں‡¦"},
    {code:"AED",label:"ط§ظ„ط¯ط±ظ‡ظ… ط§ظ„ط¥ظ…ط§ط±ط§طھظٹ",flag:"ًں‡¦ًں‡ھ"},
    {code:"GBP",label:"ط§ظ„ط¬ظ†ظٹظ‡ ط§ظ„ط¥ط³طھط±ظ„ظٹظ†ظٹ",flag:"ًں‡¬ًں‡§"}
  ];
  const currencyMeta=code=>debtCurrencies.find(item=>item.code===code)||{code,label:code,flag:"ًں’±"};
  const currencyTotals=Object.entries(data.totalsByCurrency||{});

  return <>
    <h2>ط§ظ„ط¯ظ‘ظژظٹظ† ط§ظ„ط¹ط§ظ…</h2>

    <div className="stats">
      <div className="card receivable-card">
        <span>ط¯ظٹظ† ظ„ظ†ط§ ط¨ط§ظ„ط¯ظˆظ„ط§ط± ط§ظ„ظƒظ†ط¯ظٹ</span>
        <strong>{money(data.totals.receivable)} CAD</strong>
        <small>ظٹط´ظ…ظ„ ط§ظ„ط­ظˆط§ظ„ط§طھ ط؛ظٹط± ط§ظ„ظ…ط¯ظپظˆط¹ط© طھظ„ظ‚ط§ط¦ظٹظ‹ط§</small>
      </div>
      <div className="card payable-card">
        <span>ط¯ظٹظ† ط¹ظ„ظٹظ†ط§ ط¨ط§ظ„ط¯ظˆظ„ط§ط± ط§ظ„ظƒظ†ط¯ظٹ</span>
        <strong>{money(data.totals.payable)} CAD</strong>
      </div>
      <div className="card final">
        <span>طµط§ظپظٹ ط§ظ„ط¯ظٹظˆظ† ط¨ط§ظ„ط¯ظˆظ„ط§ط± ط§ظ„ظƒظ†ط¯ظٹ</span>
        <strong>{money(data.totals.net)} CAD</strong>
      </div>
    </div>

    {currencyTotals.length>0&&<div className="debt-currency-totals">
      {currencyTotals.map(([code,total])=>{const meta=currencyMeta(code);return <div className="card debt-currency-total" key={code}>
        <strong>{meta.flag} {meta.label}</strong>
        <span>ظ„ظ†ط§: {money(total.receivable)} {code}</span>
        <span>ط¹ظ„ظٹظ†ط§: {money(total.payable)} {code}</span>
        <span>ط§ظ„طµط§ظپظٹ: {money(total.net)} {code}</span>
      </div>})}
    </div>}

    <div className="card debt-tabs">
      <button type="button" onClick={()=>setFilter("")}>ط§ظ„ظƒظ„</button>
      <button type="button" onClick={()=>setFilter("RECEIVABLE")}>ط¯ظٹظ† ظ„ظ†ط§</button>
      <button type="button" onClick={()=>setFilter("PAYABLE")}>ط¯ظٹظ† ط¹ظ„ظٹظ†ط§</button>
    </div>

    {message&&<div className="card debt-message">{message}</div>}

    <form className="card form" onSubmit={addDebt}>
      <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
        <option value="RECEIVABLE">ط¯ظٹظ† ظ„ظ†ط§</option>
        <option value="PAYABLE">ط¯ظٹظ† ط¹ظ„ظٹظ†ط§</option>
      </select>

      <input
        value={form.partyName}
        onChange={e=>setForm({...form,partyName:e.target.value})}
        placeholder="ط§ط³ظ… ط§ظ„ط´ط®طµ ط£ظˆ ط§ظ„ط¬ظ‡ط©"
        required
      />

      <input
        type="number"
        min="0.01"
        step="0.01"
        value={form.amount}
        onChange={e=>setForm({...form,amount:e.target.value})}
        placeholder="ظ…ط¨ظ„ط؛ ط§ظ„ط¯ظٹظ†"
        required
      />

      <select value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>
        {debtCurrencies.map(currency=>
          <option key={currency.code} value={currency.code}>{currency.flag} {currency.label} ({currency.code})</option>
        )}
      </select>

      <input
        type="date"
        value={form.dueDate}
        onChange={e=>setForm({...form,dueDate:e.target.value})}
      />

      <input
        value={form.reference}
        onChange={e=>setForm({...form,reference:e.target.value})}
        placeholder="ط±ظ‚ظ… ظ…ط±ط¬ط¹ ط£ظˆ ظپط§طھظˆط±ط©"
      />

      <input
        value={form.description}
        onChange={e=>setForm({...form,description:e.target.value})}
        placeholder="ظ…ظ„ط§ط­ط¸ط§طھ"
      />

      <button>ط­ظپط¸ ط§ظ„ط¯ظٹظ†</button>
    </form>

    <div className="card debt-auto-note">
      ط§ظ„ط­ظˆط§ظ„ط§طھ ط§ظ„طھظٹ ط­ط§ظ„طھظ‡ط§ آ«ط؛ظٹط± ظ…ط¯ظپظˆط¹آ» طھط¸ظ‡ط± طھظ„ظ‚ط§ط¦ظٹظ‹ط§ ط¶ظ…ظ† آ«ط¯ظٹظ† ظ„ظ†ط§آ» ط¨ط¹ظ…ظ„ط© CADطŒ ظˆطھظڈط®طµظ… طھظ„ظ‚ط§ط¦ظٹظ‹ط§ ط¹ظ†ط¯ طھط³ط¬ظٹظ„ ط¯ظپط¹ط© ظ„ظ„ط¹ظ…ظٹظ„.
    </div>

    {openDebts.length>0&&
      <form className="card form" onSubmit={addPayment}>
        <select
          value={payment.debtId}
          onChange={e=>setPayment({...payment,debtId:e.target.value})}
          required
        >
          <option value="">ط§ط®طھط± ط§ظ„ط¯ظٹظ† ظ„طھط³ط¬ظٹظ„ ط¯ظپط¹ط©</option>
          {openDebts.map(item=>
            <option key={item.id} value={item.id}>
              {item.type==="RECEIVABLE"?"ظ„ظ†ط§":"ط¹ظ„ظٹظ†ط§"} â€” {item.partyName} â€” ظ…طھط¨ظ‚ظٹ {money(item.remaining)} {item.currency}
            </option>
          )}
        </select>

        <input
          type="number"
          min="0.01"
          step="0.01"
          value={payment.amount}
          onChange={e=>setPayment({...payment,amount:e.target.value})}
          placeholder="ظ…ط¨ظ„ط؛ ط§ظ„ط¯ظپط¹ط©"
          required
        />

        <input
          type="date"
          value={payment.paymentDate}
          onChange={e=>setPayment({...payment,paymentDate:e.target.value})}
        />

        <input
          value={payment.notes}
          onChange={e=>setPayment({...payment,notes:e.target.value})}
          placeholder="ظ…ظ„ط§ط­ط¸ط§طھ ط§ظ„ط¯ظپط¹ط©"
        />

        <button>طھط³ط¬ظٹظ„ ط§ظ„ط¯ظپط¹ط©</button>
      </form>
    }

    <div className="card tablewrap">
      <table>
        <thead>
          <tr>
            <th>ط§ظ„ظ†ظˆط¹</th>
            <th>ط§ظ„ط´ط®طµ/ط§ظ„ط¬ظ‡ط©</th>
            <th>ط§ظ„ظ…ط¨ظ„ط؛</th>
            <th>ط§ظ„ظ…ط¯ظپظˆط¹</th>
            <th>ط§ظ„ظ…طھط¨ظ‚ظٹ</th>
            <th>ط§ظ„ط¹ظ…ظ„ط©</th>
            <th>ط§ظ„ط§ط³طھط­ظ‚ط§ظ‚</th>
            <th>ط§ظ„ط­ط§ظ„ط©</th>
            <th>ط§ظ„ظ…ط±ط¬ط¹</th>
            <th>ط§ظ„ظ…طµط¯ط±</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.length?
            data.rows.map(item=>
              <tr key={item.id}>
                <td>
                  <span className={`debt-type ${item.type==="RECEIVABLE"?"receivable":"payable"}`}>
                    {item.type==="RECEIVABLE"?"ط¯ظٹظ† ظ„ظ†ط§":"ط¯ظٹظ† ط¹ظ„ظٹظ†ط§"}
                  </span>
                </td>
                <td>{item.partyName}</td>
                <td>{money(item.amount)}</td>
                <td>{money(item.paid)}</td>
                <td><strong>{money(item.remaining)}</strong></td>
                <td>{item.currency}</td>
                <td>{item.dueDate||"-"}</td>
                <td>{statusLabel[item.status]||item.status}</td>
                <td>{item.reference||"-"}</td>
                <td>{item.source==="TRANSFER"?"ط­ظˆط§ظ„ط© ط؛ظٹط± ظ…ط¯ظپظˆط¹ط© طھظ„ظ‚ط§ط¦ظٹظ‹ط§":"ط¯ظٹظ† ظ…ط¶ط§ظپ ظٹط¯ظˆظٹظ‹ط§"}</td>
              </tr>
            )
            :<tr><td colSpan="10">ظ„ط§ طھظˆط¬ط¯ ط¯ظٹظˆظ† ظ…ط³ط¬ظ„ط©.</td></tr>
          }
        </tbody>
      </table>
    </div>
  </>;
}


function PartnerProfile({id,back}){
  const [data,setData]=useState(null);
  const [error,setError]=useState("");
  const [transaction,setTransaction]=useState({
    type:"RECEIVABLE",amount:"",currency:"CAD",date:new Date().toISOString().slice(0,10),
    dueDate:"",reference:"",description:""
  });
  const [payment,setPayment]=useState({
    direction:"RECEIVED",amount:"",currency:"CAD",date:new Date().toISOString().slice(0,10),
    reference:"",notes:""
  });
  const [showStatement,setShowStatement]=useState(false);

  async function load(){
    try{
      const response=await api.get(`/partners/${id}`);
      setData(response.data);
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± طھط­ظ…ظٹظ„ ط§ظ„ظ…ظˆط±ط¯ ط£ظˆ ط§ظ„ط´ط±ظƒط©");
    }
  }

  useEffect(()=>{load();},[id]);

  async function addTransaction(event){
    event.preventDefault();
    await api.post(`/partners/${id}/transactions`,transaction);
    setTransaction(current=>({...current,amount:"",reference:"",description:""}));
    await load();
  }

  async function addPayment(event){
    event.preventDefault();
    await api.post(`/partners/${id}/payments`,payment);
    setPayment(current=>({...current,amount:"",reference:"",notes:""}));
    await load();
  }

  if(showStatement)return <PartnerStatement partnerId={id} back={()=>setShowStatement(false)}/>;
  if(error&&!data)return <div className="card customer-error"><button onClick={back}>ط±ط¬ظˆط¹</button><p>{error}</p></div>;
  if(!data)return <p>ط¬ط§ط±ظٹ ط§ظ„طھط­ظ…ظٹظ„...</p>;

  return <>
    <div className="card form no-print">
      <button onClick={back}>ط±ط¬ظˆط¹</button>
      <button onClick={()=>setShowStatement(true)}>ظƒط´ظپ ط­ط³ط§ط¨</button>
    </div>

    <h2>{data.partner.name}</h2>
    <div className="stats">
      <div className="card receivable-card"><span>ط¯ظٹظ† ظ„ظ†ط§</span><strong>{money(data.totals.receivable)}</strong></div>
      <div className="card payable-card"><span>ط¯ظٹظ† ط¹ظ„ظٹظ†ط§</span><strong>{money(data.totals.payable)}</strong></div>
      <div className="card final"><span>طµط§ظپظٹ ط§ظ„ط­ط³ط§ط¨</span><strong>{money(data.totals.net)}</strong></div>
    </div>

    <div className="card">
      <p><strong>ط§ظ„ظ…ط³ط¤ظˆظ„:</strong> {data.partner.contactName||"-"}</p>
      <p><strong>ط§ظ„ظ‡ط§طھظپ:</strong> {data.partner.phone||"-"}</p>
      <p><strong>ظˆط§طھط³ط§ط¨:</strong> {data.partner.whatsapp||"-"}</p>
      <p><strong>ط§ظ„ط¨ط±ظٹط¯:</strong> {data.partner.email||"-"}</p>
      <p><strong>ط§ظ„ظ…ظˆظ‚ط¹:</strong> {[data.partner.city,data.partner.country].filter(Boolean).join("طŒ ")||"-"}</p>
    </div>

    <form className="card form" onSubmit={addTransaction}>
      <select value={transaction.type} onChange={e=>setTransaction({...transaction,type:e.target.value})}>
        <option value="RECEIVABLE">ط¯ظٹظ† ظ„ظ†ط§</option>
        <option value="PAYABLE">ط¯ظٹظ† ط¹ظ„ظٹظ†ط§</option>
      </select>
      <input type="number" min=".01" step=".01" value={transaction.amount} onChange={e=>setTransaction({...transaction,amount:e.target.value})} placeholder="ط§ظ„ظ…ط¨ظ„ط؛" required/>
      <select value={transaction.currency} onChange={e=>setTransaction({...transaction,currency:e.target.value})}>
        <option value="CAD">CAD ًں‡¨ًں‡¦ â€” ط§ظ„ط¯ظˆظ„ط§ط± ط§ظ„ظƒظ†ط¯ظٹ</option>
        <option value="USD">USD ًں‡؛ًں‡¸ â€” ط§ظ„ط¯ظˆظ„ط§ط± ط§ظ„ط£ظ…ط±ظٹظƒظٹ</option>
        <option value="SYP">SYP ًں‡¸ًں‡¾ â€” ط§ظ„ظ„ظٹط±ط© ط§ظ„ط³ظˆط±ظٹط©</option>
      </select>
      <input type="date" value={transaction.date} onChange={e=>setTransaction({...transaction,date:e.target.value})}/>
      <input type="date" value={transaction.dueDate} onChange={e=>setTransaction({...transaction,dueDate:e.target.value})}/>
      <input value={transaction.reference} onChange={e=>setTransaction({...transaction,reference:e.target.value})} placeholder="ط§ظ„ظ…ط±ط¬ط¹"/>
      <input value={transaction.description} onChange={e=>setTransaction({...transaction,description:e.target.value})} placeholder="ط§ظ„ط¨ظٹط§ظ†"/>
      <button>ط­ظپط¸ ط§ظ„ط¹ظ…ظ„ظٹط©</button>
    </form>

    <form className="card form" onSubmit={addPayment}>
      <select value={payment.direction} onChange={e=>setPayment({...payment,direction:e.target.value})}>
        <option value="RECEIVED">ط§ط³طھظ„ظ…ظ†ط§ ط¯ظپط¹ط©</option>
        <option value="PAID">ط¯ظپط¹ظ†ط§ ظ…ط¨ظ„ط؛ظ‹ط§</option>
      </select>
      <input type="number" min=".01" step=".01" value={payment.amount} onChange={e=>setPayment({...payment,amount:e.target.value})} placeholder="ظ…ط¨ظ„ط؛ ط§ظ„ط¯ظپط¹ط©" required/>
      <select value={payment.currency} onChange={e=>setPayment({...payment,currency:e.target.value})}>
        <option value="CAD">CAD ًں‡¨ًں‡¦ â€” ط§ظ„ط¯ظˆظ„ط§ط± ط§ظ„ظƒظ†ط¯ظٹ</option>
        <option value="USD">USD ًں‡؛ًں‡¸ â€” ط§ظ„ط¯ظˆظ„ط§ط± ط§ظ„ط£ظ…ط±ظٹظƒظٹ</option>
        <option value="SYP">SYP ًں‡¸ًں‡¾ â€” ط§ظ„ظ„ظٹط±ط© ط§ظ„ط³ظˆط±ظٹط©</option>
      </select>
      <input type="date" value={payment.date} onChange={e=>setPayment({...payment,date:e.target.value})}/>
      <input value={payment.reference} onChange={e=>setPayment({...payment,reference:e.target.value})} placeholder="ط§ظ„ظ…ط±ط¬ط¹"/>
      <input value={payment.notes} onChange={e=>setPayment({...payment,notes:e.target.value})} placeholder="ظ…ظ„ط§ط­ط¸ط§طھ"/>
      <button>ط­ظپط¸ ط§ظ„ط¯ظپط¹ط©</button>
    </form>
  </>;
}

function PartnerStatement({partnerId,back}){
  const [filters,setFilters]=useState({from:"",to:""});
  const [data,setData]=useState(null);
  const [error,setError]=useState("");

  async function load(){
    try{
      const response=await api.get(`/partners/${partnerId}/statement`,{params:filters});
      setData(response.data);
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± ط¥ظ†ط´ط§ط، ظƒط´ظپ ط§ظ„ط­ط³ط§ط¨");
    }
  }

  useEffect(()=>{load();},[partnerId]);

  function sendWhatsApp(){
    if(!data)return;
    const phone=String(data.partner.whatsapp||data.partner.phone||"").replace(/\D/g,"");
    if(!phone){
      setError("ظ„ط§ ظٹظˆط¬ط¯ ط±ظ‚ظ… ظˆط§طھط³ط§ط¨ ظ…ط­ظپظˆط¸");
      return;
    }
    const message=[
      `ط§ظ„ط³ظ„ط§ظ… ط¹ظ„ظٹظƒظ… ${data.partner.name}طŒ`,
      `طھظ… طھط¬ظ‡ظٹط² ظƒط´ظپ ط§ظ„ط­ط³ط§ط¨ ظ…ظ† ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ظ„ظ„طھط¬ط§ط±ط©.`,
      `ط§ظ„ط±طµظٹط¯ ط§ظ„ظ†ظ‡ط§ط¦ظٹ: ${money(data.finalBalance)}`
    ].join("\n");
    openRegularWhatsApp(phone,message);
  }

  return <>
    <div className="card form no-print">
      <button onClick={back}>ط±ط¬ظˆط¹</button>
      <input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})}/>
      <input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})}/>
      <button onClick={load}>طھط­ط¯ظٹط«</button>
      <button onClick={()=>window.print()}>ط·ط¨ط§ط¹ط© / PDF</button>
      <button onClick={sendWhatsApp}>ظˆط§طھط³ط§ط¨</button>
    </div>
    {error&&<div className="card customer-error">{error}</div>}
    {data&&<section className="invoice-sheet">
      <div className="invoice-header">
        <div>
          <h1>{data.company.name}</h1>
          <p>{data.company.nameEn}</p>
          <h3>ظƒط´ظپ ط­ط³ط§ط¨ ظ…ظˆط±ط¯ / ط´ط±ظƒط©</h3>
        </div>
        <div>
          <p><strong>ط§ظ„ط¬ظ‡ط©:</strong> {data.partner.name}</p>
          <p><strong>ط§ظ„ظپطھط±ط©:</strong> {data.from||"ط§ظ„ط¨ط¯ط§ظٹط©"} ط¥ظ„ظ‰ {data.to||"ط§ظ„ظٹظˆظ…"}</p>
        </div>
      </div>
      <table>
        <thead><tr><th>ط§ظ„طھط§ط±ظٹط®</th><th>ط§ظ„ظ†ظˆط¹</th><th>ظ…ط¯ظٹظ†</th><th>ط¯ط§ط¦ظ†</th><th>ط§ظ„ط±طµظٹط¯</th><th>ط§ظ„ظ…ط±ط¬ط¹</th></tr></thead>
        <tbody>{data.rows.length?data.rows.map(row=><tr key={row.id}>
          <td>{row.date}</td><td>{row.kind}</td><td>{money(row.debit)}</td><td>{money(row.credit)}</td><td>{money(row.balance)}</td><td>{row.reference||"-"}</td>
        </tr>):<tr><td colSpan="6">ظ„ط§ طھظˆط¬ط¯ ط¹ظ…ظ„ظٹط§طھ.</td></tr>}</tbody>
      </table>
      <div className="card final"><span>ط§ظ„ط±طµظٹط¯ ط§ظ„ظ†ظ‡ط§ط¦ظٹ</span><strong>{money(data.finalBalance)}</strong></div>
    </section>}
  </>;
}

function Partners({open}){
  const [data,setData]=useState({rows:[],totals:{receivable:0,payable:0,net:0}});
  const [error,setError]=useState("");
  const [form,setForm]=useState({
    name:"",contactName:"",phone:"",whatsapp:"",email:"",
    country:"",city:"",address:"",notes:""
  });

  async function load(){
    try{
      const response=await api.get("/partners");
      setData(response.data);
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± طھط­ظ…ظٹظ„ ط§ظ„ظ…ظˆط±ط¯ظٹظ† ظˆط§ظ„ط´ط±ظƒط§طھ");
    }
  }

  useEffect(()=>{load();},[]);

  async function add(event){
    event.preventDefault();
    await api.post("/partners",form);
    setForm({name:"",contactName:"",phone:"",whatsapp:"",email:"",country:"",city:"",address:"",notes:""});
    await load();
  }

  return <>
    <h2>ط§ظ„ط´ط±ظƒط§طھ</h2>
    {error&&<div className="card customer-error">{error}</div>}
    <div className="stats">
      <div className="card receivable-card"><span>ط¥ط¬ظ…ط§ظ„ظٹ ط¯ظٹظ† ظ„ظ†ط§</span><strong>{money(data.totals.receivable)}</strong></div>
      <div className="card payable-card"><span>ط¥ط¬ظ…ط§ظ„ظٹ ط¯ظٹظ† ط¹ظ„ظٹظ†ط§</span><strong>{money(data.totals.payable)}</strong></div>
      <div className="card final"><span>ط§ظ„طµط§ظپظٹ</span><strong>{money(data.totals.net)}</strong></div>
    </div>

    <form className="card form" onSubmit={add}>
      <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="ط§ط³ظ… ط§ظ„ظ…ظˆط±ط¯ ط£ظˆ ط§ظ„ط´ط±ظƒط©" required/>
      <input value={form.contactName} onChange={e=>setForm({...form,contactName:e.target.value})} placeholder="ط§ط³ظ… ط§ظ„ظ…ط³ط¤ظˆظ„"/>
      <input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="ط§ظ„ظ‡ط§طھظپ"/>
      <input value={form.whatsapp} onChange={e=>setForm({...form,whatsapp:e.target.value})} placeholder="ظˆط§طھط³ط§ط¨"/>
      <input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="ط§ظ„ط¨ط±ظٹط¯"/>
      <input value={form.country} onChange={e=>setForm({...form,country:e.target.value})} placeholder="ط§ظ„ط¯ظˆظ„ط©"/>
      <input value={form.city} onChange={e=>setForm({...form,city:e.target.value})} placeholder="ط§ظ„ظ…ط¯ظٹظ†ط©"/>
      <input value={form.address} onChange={e=>setForm({...form,address:e.target.value})} placeholder="ط§ظ„ط¹ظ†ظˆط§ظ†"/>
      <button>ط¥ط¶ط§ظپط©</button>
    </form>

    <div className="card tablewrap">
      <table>
        <thead><tr><th>ط§ظ„ط§ط³ظ…</th><th>ط§ظ„ظ…ط³ط¤ظˆظ„</th><th>ط§ظ„ظ‡ط§طھظپ</th><th>ط¯ظٹظ† ظ„ظ†ط§</th><th>ط¯ظٹظ† ط¹ظ„ظٹظ†ط§</th><th>ط§ظ„طµط§ظپظٹ</th><th>ط§ظ„ظ…ظ„ظپ</th></tr></thead>
        <tbody>{data.rows.length?data.rows.map(partner=><tr key={partner.id}>
          <td>{partner.name}</td><td>{partner.contactName||"-"}</td><td>{partner.phone||"-"}</td>
          <td>{money(partner.receivable)}</td><td>{money(partner.payable)}</td><td><strong>{money(partner.net)}</strong></td>
          <td><button onClick={()=>open(partner.id)}>ظپطھط­</button></td>
        </tr>):<tr><td colSpan="7">ظ„ط§ طھظˆط¬ط¯ ط´ط±ظƒط§طھ ط£ظˆ ظ…ظˆط±ط¯ظˆظ†.</td></tr>}</tbody>
      </table>
    </div>
  </>;
}

function CapitalOverview(){
  const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
  const [data,setData]=useState(null);
  const [movements,setMovements]=useState([]);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState({
    type:"IN",
    amount:"",
    currency:"CAD",
    description:"",
    date:new Date().toISOString().slice(0,10)
  });

  async function load(){
    setError("");
    try{
      const [overviewResponse,movementsResponse]=await Promise.all([
        api.get("/capital-overview",{params:{month}}),
        api.get("/capital")
      ]);
      setData(overviewResponse.data);
      setMovements(Array.isArray(movementsResponse.data)?movementsResponse.data:[]);
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± طھط­ظ…ظٹظ„ ط±ط£ط³ ط§ظ„ظ…ط§ظ„");
    }
  }

  useEffect(()=>{load();},[month]);

  async function addCapital(event){
    event.preventDefault();
    setError("");setMessage("");
    try{
      await api.post("/capital",form);
      setForm({
        type:"IN",
        amount:"",
        currency:"CAD",
        description:"",
        date:new Date().toISOString().slice(0,10)
      });
      setMessage("طھظ…طھ ط¥ط¶ط§ظپط© ط­ط±ظƒط© ط±ط£ط³ ط§ظ„ظ…ط§ظ„ ط¨ظ†ط¬ط§ط­");
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± ط¥ط¶ط§ظپط© ط±ط£ط³ ط§ظ„ظ…ط§ظ„");
    }
  }

  async function saveEdit(event){
    event.preventDefault();
    setError("");setMessage("");
    try{
      await api.patch(`/capital/${editing.id}`,editing);
      setEditing(null);
      setMessage("طھظ… طھط¹ط¯ظٹظ„ ط­ط±ظƒط© ط±ط£ط³ ط§ظ„ظ…ط§ظ„ ط¨ظ†ط¬ط§ط­");
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± طھط¹ط¯ظٹظ„ ط±ط£ط³ ط§ظ„ظ…ط§ظ„");
    }
  }

  async function deleteCapital(item){
    if(!window.confirm(`ظ‡ظ„ طھط±ظٹط¯ ط­ط°ظپ ط­ط±ظƒط© ط±ط£ط³ ط§ظ„ظ…ط§ظ„ ط¨ظ‚ظٹظ…ط© ${money(item.amount)} ${item.currency||"CAD"}طں`))return;
    setError("");setMessage("");
    try{
      await api.delete(`/capital/${item.id}`);
      setMessage("طھظ… ط­ط°ظپ ط­ط±ظƒط© ط±ط£ط³ ط§ظ„ظ…ط§ظ„");
      if(editing?.id===item.id)setEditing(null);
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± ط­ط°ظپ ط±ط£ط³ ط§ظ„ظ…ط§ظ„");
    }
  }

  if(!data)return <><h2>âڑ–ï¸ڈ ط§ظ„ظ…ظٹط²ط§ظ†ظٹط©</h2>{error?<div className="card customer-error">{error}</div>:<p>ط¬ط§ط±ظٹ ط§ظ„طھط­ظ…ظٹظ„...</p>}</>;

  const efficiency=data.turnoverRate>=3?"ظ…ظ…طھط§ط²":data.turnoverRate>=2?"ط¬ظٹط¯ ط¬ط¯ط§ظ‹":data.turnoverRate>=1?"ط¬ظٹط¯":"ظ…ظ†ط®ظپط¶";
  const capitalIn=movements.filter(item=>item.type==="IN").reduce((sum,item)=>sum+Number(item.amount||0),0);
  const capitalOut=movements.filter(item=>item.type==="OUT").reduce((sum,item)=>sum+Number(item.amount||0),0);

  return <>
    <div className="page-title-row">
      <h2>âڑ–ï¸ڈ ط§ظ„ظ…ظٹط²ط§ظ†ظٹط©</h2>
      <button className="no-print" onClick={()=>window.print()}>ط·ط¨ط§ط¹ط© ط§ظ„طھظ‚ط±ظٹط±</button>
    </div>

    {error&&<div className="card customer-error">{error}</div>}
    {message&&<div className="card rate-message">{message}</div>}

    <div className="stats capital-management-stats">
      <div className="card final">
        <span>ط±ط£ط³ ط§ظ„ظ…ط§ظ„ ط§ظ„ظƒظ„ظٹ ط§ظ„طھظ‚ط¯ظٹط±ظٹ</span>
        <strong>{money(data.totalCapital)} CAD</strong>
      </div>
      <div className="card receivable-card">
        <span>ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط¥ط¶ط§ظپط§طھ</span>
        <strong>{money(capitalIn)} CAD</strong>
      </div>
      <div className="card payable-card">
        <span>ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط³ط­ظˆط¨ط§طھ</span>
        <strong>{money(capitalOut)} CAD</strong>
      </div>
      <div className="card">
        <span>طµط§ظپظٹ ط­ط±ظƒط© ط±ط£ط³ ط§ظ„ظ…ط§ظ„</span>
        <strong>{money(data.capitalBalance)} CAD</strong>
      </div>
    </div>

    <form className="card form capital-manage-form no-print" onSubmit={addCapital}>
      <h3>â‍• ط¥ط¶ط§ظپط© ط±ط£ط³ ظ…ط§ظ„ ط£ظˆ ط³ط­ط¨</h3>
      <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
        <option value="IN">ط¥ط¶ط§ظپط© ط±ط£ط³ ظ…ط§ظ„</option>
        <option value="OUT">ط³ط­ط¨ ظ…ظ† ط±ط£ط³ ط§ظ„ظ…ط§ظ„</option>
      </select>
      <input
        type="number"
        min=".01"
        step=".01"
        value={form.amount}
        onChange={e=>setForm({...form,amount:e.target.value})}
        placeholder="ط§ظ„ظ…ط¨ظ„ط؛"
        required
      />
      <select value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>
        {["CAD","USD","EUR","SYP","AED","GBP"].map(currency=><option key={currency}>{currency}</option>)}
      </select>
      <label className="capital-today-field">
        <span>ًں“… طھط§ط±ظٹط® ط§ظ„ظٹظˆظ…</span>
        <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>
      </label>
      <input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="ط§ظ„ظˆطµظپ ط£ظˆ ط³ط¨ط¨ ط§ظ„ط¥ط¶ط§ظپط© / ط§ظ„ط³ط­ط¨"/>
      <button>{form.type==="IN"?"ط¥ط¶ط§ظپط© ط±ط£ط³ ط§ظ„ظ…ط§ظ„":"طھط³ط¬ظٹظ„ ط§ظ„ط³ط­ط¨"}</button>
    </form>

    {editing&&<form className="card form edit-panel capital-edit-form no-print" onSubmit={saveEdit}>
      <h3>âœڈï¸ڈ طھط¹ط¯ظٹظ„ ط­ط±ظƒط© ط±ط£ط³ ط§ظ„ظ…ط§ظ„</h3>
      <select value={editing.type} onChange={e=>setEditing({...editing,type:e.target.value})}>
        <option value="IN">ط¥ط¶ط§ظپط© ط±ط£ط³ ظ…ط§ظ„</option>
        <option value="OUT">ط³ط­ط¨ ظ…ظ† ط±ط£ط³ ط§ظ„ظ…ط§ظ„</option>
      </select>
      <input type="number" min=".01" step=".01" value={editing.amount} onChange={e=>setEditing({...editing,amount:e.target.value})} required/>
      <select value={editing.currency||"CAD"} onChange={e=>setEditing({...editing,currency:e.target.value})}>
        {["CAD","USD","EUR","SYP","AED","GBP"].map(currency=><option key={currency}>{currency}</option>)}
      </select>
      <input type="date" value={editing.date||""} onChange={e=>setEditing({...editing,date:e.target.value})}/>
      <input value={editing.description||""} onChange={e=>setEditing({...editing,description:e.target.value})} placeholder="ط§ظ„ظˆطµظپ"/>
      <button>ط­ظپط¸ ط§ظ„طھط¹ط¯ظٹظ„</button>
      <button type="button" onClick={()=>setEditing(null)}>ط¥ظ„ط؛ط§ط،</button>
    </form>}

    <div className="card tablewrap capital-movements-table">
      <h3>ًں“‹ ط³ط¬ظ„ ط±ط£ط³ ط§ظ„ظ…ط§ظ„</h3>
      <table>
        <thead>
          <tr>
            <th>ط§ظ„طھط§ط±ظٹط®</th>
            <th>ط§ظ„ظ†ظˆط¹</th>
            <th>ط§ظ„ظ…ط¨ظ„ط؛</th>
            <th>ط§ظ„ط¹ظ…ظ„ط©</th>
            <th>ط§ظ„ظˆطµظپ</th>
            <th className="no-print">ط§ظ„ط¥ط¬ط±ط§ط،ط§طھ</th>
          </tr>
        </thead>
        <tbody>{movements.length?movements.map(item=><tr key={item.id}>
          <td>{item.date||String(item.createdAt||"").slice(0,10)}</td>
          <td><span className={`capital-type-badge ${item.type==="IN"?"capital-in":"capital-out"}`}>
            {item.type==="IN"?"ط¥ط¶ط§ظپط©":"ط³ط­ط¨"}
          </span></td>
          <td><strong>{money(item.amount)}</strong></td>
          <td>{item.currency||"CAD"}</td>
          <td>{item.description||"-"}</td>
          <td className="actions no-print">
            <button type="button" onClick={()=>setEditing({...item})}>طھط¹ط¯ظٹظ„</button>
            <button type="button" className="danger-button" onClick={()=>deleteCapital(item)}>ط­ط°ظپ</button>
          </td>
        </tr>):<tr><td colSpan="6">ظ„ط§ طھظˆط¬ط¯ ط­ط±ظƒط§طھ ط±ط£ط³ ظ…ط§ظ„ ظ…ط³ط¬ظ„ط©.</td></tr>}</tbody>
      </table>
    </div>

    <div className="card form no-print">
      <label>ط§ط®طھظٹط§ط± ط§ظ„ط´ظ‡ط± ظ„ظ„طھظ‚ط±ظٹط±</label>
      <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/>
      <button onClick={load}>طھط­ط¯ظٹط« ط§ظ„طھظ‚ط±ظٹط±</button>
    </div>

    <div className="stats">
      <div className="card transfer-total-card">
        <span>ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط­ظˆط§ظ„ط§طھ ظپظٹ ط§ظ„ط´ظ‡ط±</span>
        <strong>{money(data.monthlyTransferValue)}</strong>
      </div>
      <div className="card turnover-card">
        <span>ظ…ط¹ط¯ظ„ ط¯ظˆط±ط§ظ† ط±ط£ط³ ط§ظ„ظ…ط§ظ„</span>
        <strong>{Number(data.turnoverRate).toFixed(2)} ظ…ط±ط©</strong>
        <small>{efficiency}</small>
      </div>
      <div className="card"><span>ط£ط±ط¨ط§ط­ ط§ظ„ط´ظ‡ط±</span><strong>{money(data.monthlyProfit)}</strong></div>
      <div className="card"><span>ظ…طµط±ظˆظپط§طھ ط§ظ„ط´ظ‡ط±</span><strong>{money(data.monthlyExpenses)}</strong></div>
    </div>

    <div className="card capital-formula">
      <h3>ط­ط±ظƒط© ط¯ظˆط±ط§ظ† ط±ط£ط³ ط§ظ„ظ…ط§ظ„</h3>
      <p><strong>ط¥ط¬ظ…ط§ظ„ظٹ ظ‚ظٹظ…ط© ط§ظ„ط­ظˆط§ظ„ط§طھ ط§ظ„ط´ظ‡ط±ظٹط© أ· ط±ط£ط³ ط§ظ„ظ…ط§ظ„ ط§ظ„ظ…ط³طھط®ط¯ظ…</strong></p>
      <p>ط§ظ„ظ†طھظٹط¬ط© ط§ظ„ط­ط§ظ„ظٹط©: <strong>{Number(data.turnoverRate).toFixed(2)} ظ…ط±ط©</strong> ط®ظ„ط§ظ„ ط´ظ‡ط± {data.month}.</p>
    </div>
  </>;
}

function MonthlyReport(){
  const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
  const [data,setData]=useState(null);
  const [error,setError]=useState("");

  async function load(){
    setError("");
    try{
      const response=await api.get("/monthly-report",{params:{month}});
      setData(response.data);
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± طھط­ظ…ظٹظ„ ط§ظ„طھظ‚ط±ظٹط± ط§ظ„ط´ظ‡ط±ظٹ");
    }
  }

  useEffect(()=>{load();},[month]);

  if(!data)return <><h2>ط§ظ„طھظ‚ط±ظٹط± ط§ظ„ط´ظ‡ط±ظٹ</h2>{error?<div className="card customer-error">{error}</div>:<p>ط¬ط§ط±ظٹ ط§ظ„طھط­ظ…ظٹظ„...</p>}</>;

  const s=data.summary;

  return <>
    <div className="page-title-row">
      <h2>ط§ظ„طھظ‚ط±ظٹط± ط§ظ„ط´ظ‡ط±ظٹ â€” {data.month}</h2>
      <button className="no-print" onClick={()=>window.print()}>ط·ط¨ط§ط¹ط© / ط­ظپط¸ PDF</button>
    </div>

    <div className="card form no-print">
      <label>ط§ظ„ط´ظ‡ط±</label>
      <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/>
      <button onClick={load}>ط¹ط±ط¶ ط§ظ„طھظ‚ط±ظٹط±</button>
    </div>

    {error&&<div className="card customer-error">{error}</div>}

    <div className="stats">
      <div className="card transfer-total-card"><span>ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط­ظˆط§ظ„ط§طھ</span><strong>{money(s.transferTotal)}</strong></div>
      <div className="card"><span>ط¹ط¯ط¯ ط§ظ„ط­ظˆط§ظ„ط§طھ</span><strong>{s.transferCount}</strong></div>
      <div className="card"><span>ظ…طھظˆط³ط· ط§ظ„ط­ظˆط§ظ„ط©</span><strong>{money(s.averageTransfer)}</strong></div>
      <div className="card"><span>ط£ظƒط¨ط± ط­ظˆط§ظ„ط©</span><strong>{money(s.largestTransfer)}</strong></div>
      <div className="card"><span>ط£طµط؛ط± ط­ظˆط§ظ„ط©</span><strong>{money(s.smallestTransfer)}</strong></div>
    </div>

    <div className="stats">
      <div className="card"><span>ط£ط¬ظˆط± ط§ظ„ط­ظˆط§ظ„ط§طھ</span><strong>{money(s.feesTotal)}</strong></div>
      <div className="card"><span>ط±ط¨ط­ ظپط±ظ‚ ط§ظ„ط³ط¹ط±</span><strong>{money(s.exchangeProfit)}</strong></div>
      <div className="card"><span>ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط±ط¨ط­</span><strong>{money(s.grossProfit)}</strong></div>
      <div className="card payable-card"><span>ط§ظ„ظ…طµط±ظˆظپط§طھ</span><strong>{money(s.expenses)}</strong></div>
      <div className="card final"><span>طµط§ظپظٹ ط§ظ„ط±ط¨ط­</span><strong>{money(s.netProfit)}</strong></div>
    </div>

    <div className="stats">
      <div className="card"><span>ط§ظ„ط¯ظپط¹ط§طھ ط§ظ„ظ…ط³طھظ„ظ…ط©</span><strong>{money(s.paymentsReceived)}</strong></div>
      <div className="card receivable-card"><span>ط¥ط¶ط§ظپط§طھ ط±ط£ط³ ط§ظ„ظ…ط§ظ„</span><strong>{money(s.capitalIn)}</strong></div>
      <div className="card payable-card"><span>ط³ط­ظˆط¨ط§طھ ط±ط£ط³ ط§ظ„ظ…ط§ظ„</span><strong>{money(s.capitalOut)}</strong></div>
      <div className="card"><span>طµط§ظپظٹ ط­ط±ظƒط© ط±ط£ط³ ط§ظ„ظ…ط§ظ„</span><strong>{money(s.netCapitalMovement)}</strong></div>
    </div>

    <div className="card tablewrap">
      <h3>ط§ظ„ط­ط±ظƒط© ط§ظ„ظٹظˆظ…ظٹط© ط®ظ„ط§ظ„ ط§ظ„ط´ظ‡ط±</h3>
      <table>
        <thead><tr><th>ط§ظ„طھط§ط±ظٹط®</th><th>ط¹ط¯ط¯ ط§ظ„ط­ظˆط§ظ„ط§طھ</th><th>ظ‚ظٹظ…ط© ط§ظ„ط­ظˆط§ظ„ط§طھ</th><th>ط§ظ„ط±ط¨ط­</th></tr></thead>
        <tbody>{data.daily.length?data.daily.map(row=><tr key={row.date}>
          <td>{row.date}</td>
          <td>{row.count}</td>
          <td>{money(row.total)}</td>
          <td>{money(row.profit)}</td>
        </tr>):<tr><td colSpan="4">ظ„ط§ طھظˆط¬ط¯ ط­ظˆط§ظ„ط§طھ ظپظٹ ظ‡ط°ط§ ط§ظ„ط´ظ‡ط±.</td></tr>}</tbody>
      </table>
    </div>

    <div className="card tablewrap">
      <h3>ط£ظƒط«ط± ط§ظ„ط¹ظ…ظ„ط§ط، طھط¹ط§ظ…ظ„ظ‹ط§ ط®ظ„ط§ظ„ ط§ظ„ط´ظ‡ط±</h3>
      <table>
        <thead><tr><th>ط§ظ„ط¹ظ…ظٹظ„</th><th>ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط­ظˆط§ظ„ط§طھ</th></tr></thead>
        <tbody>{data.topCustomers.length?data.topCustomers.map(row=><tr key={row.customerId}>
          <td>{row.customerName}</td>
          <td>{money(row.total)}</td>
        </tr>):<tr><td colSpan="2">ظ„ط§ طھظˆط¬ط¯ ط¨ظٹط§ظ†ط§طھ.</td></tr>}</tbody>
      </table>
    </div>

    <div className="card tablewrap">
      <h3>طھظپط§طµظٹظ„ ط­ظˆط§ظ„ط§طھ ط§ظ„ط´ظ‡ط±</h3>
      <table>
        <thead><tr><th>ط§ظ„ط±ظ‚ظ…</th><th>ط§ظ„طھط§ط±ظٹط®</th><th>ط§ظ„ظ…ط¨ظ„ط؛</th><th>ط§ظ„ط£ط¬ظˆط±</th><th>ط§ظ„ط±ط¨ط­</th></tr></thead>
        <tbody>{data.transactions.length?data.transactions.map(item=><tr key={item.id}>
          <td>{item.number||item.id}</td>
          <td>{item.transferDate||String(item.createdAt||"").slice(0,10)}</td>
          <td>{money(item.amount)}</td>
          <td>{money(item.transferFee)}</td>
          <td>{money(item.totalProfit)}</td>
        </tr>):<tr><td colSpan="5">ظ„ط§ طھظˆط¬ط¯ ط­ظˆط§ظ„ط§طھ.</td></tr>}</tbody>
      </table>
    </div>
  </>;
}

function NotificationSettings({embedded=false}){
  const [settings,setSettings]=useState({overdueDays:7,lowCashLimit:5000,whatsappTemplate:""});
  const [message,setMessage]=useState("");

  useEffect(()=>{
    api.get("/notification-settings").then(response=>setSettings(response.data));
  },[]);

  async function save(event){
    event.preventDefault();
    try{
      const response=await api.patch("/notification-settings",settings);
      setSettings(response.data);
      setMessage("طھظ… ط­ظپط¸ ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„طھظ†ط¨ظٹظ‡ط§طھ");
    }catch(error){
      setMessage(error.response?.data?.message||"طھط¹ط°ط± ط­ظپط¸ ط§ظ„ط¥ط¹ط¯ط§ط¯ط§طھ");
    }
  }

  return <div className={embedded?"notification-settings-embedded":"notification-settings-page"}>
    {!embedded&&<h2>ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„طھظ†ط¨ظٹظ‡ط§طھ ظˆظˆط§طھط³ط§ط¨</h2>}
    {message&&<div className="card rate-message">{message}</div>}
    <form className="card form settings-form" onSubmit={save}>
      <label>ط¨ط¯ط، طھظ†ط¨ظٹظ‡ ط§ظ„طھط£ط®ظٹط± ط¨ط¹ط¯ ط¹ط¯ط¯ ط§ظ„ط£ظٹط§ظ…</label>
      <input type="number" min="1" max="365" value={settings.overdueDays}
        onChange={e=>setSettings({...settings,overdueDays:e.target.value})}/>
      <label>ط­ط¯ ط§ظ†ط®ظپط§ط¶ ط§ظ„ط³ظٹظˆظ„ط© (CAD)</label>
      <input type="number" min="0" step=".01" value={settings.lowCashLimit}
        onChange={e=>setSettings({...settings,lowCashLimit:e.target.value})}/>
      <label>ظ‚ط§ظ„ط¨ ط±ط³ط§ظ„ط© ظˆط§طھط³ط§ط¨ (ط§ط®طھظٹط§ط±ظٹ)</label>
      <textarea rows="6" value={settings.whatsappTemplate}
        onChange={e=>setSettings({...settings,whatsappTemplate:e.target.value})}
        placeholder="ظٹظ…ظƒظ† ط§ط³طھط®ط¯ط§ظ…: {name} {balance} {days}"/>
      <button>ط­ظپط¸ ط§ظ„ط¥ط¹ط¯ط§ط¯ط§طھ</button>
    </form>
    <div className={embedded?"settings-help":"card"}>
      <strong>ظ…ظ„ط§ط­ط¸ط©:</strong>
      <p>ط²ط± ظˆط§طھط³ط§ط¨ ظٹظپطھط­ ط§ظ„ط±ط³ط§ظ„ط© ط¬ط§ظ‡ط²ط© ظ„ظ„ط¥ط±ط³ط§ظ„. ط§ظ„ط¥ط±ط³ط§ظ„ ط§ظ„طھظ„ظ‚ط§ط¦ظٹ ط¯ظˆظ† ط¶ط؛ط· ظٹط­طھط§ط¬ ط±ط¨ط· WhatsApp Business API ط±ط³ظ…ظٹ.</p>
    </div>
  </div>;
}


function SettingsPanel(){
  const savedUser=(()=>{
    try{return JSON.parse(localStorage.getItem("afs_user")||"{}")}catch{return {}}
  })();

  const [language,setLanguage]=useState(localStorage.getItem("alaboud_language")||"ar");
  const [displayMode,setDisplayMode]=useState(localStorage.getItem("alaboud_display_mode")||"comfortable");
  const [currency,setCurrency]=useState(localStorage.getItem("alaboud_primary_currency")||"CAD");
  const [message,setMessage]=useState("");
  const [updateInfo,setUpdateInfo]=useState({checking:false,status:"",version:"v16.0.13 Enterprise"});
  const [accountForm,setAccountForm]=useState({name:"",email:"",password:"",role:"USER"});
  const [passwordForm,setPasswordForm]=useState({currentPassword:"",newPassword:"",confirmPassword:""});
  const [companyProfile,setCompanyProfile]=useState({name:savedUser.companyName||"",phone:"",logoDataUrl:""});
  const [companySaving,setCompanySaving]=useState(false);

  useEffect(()=>{
    api.get("/company-profile").then(({data})=>setCompanyProfile(data)).catch(()=>{});
  },[]);

  function chooseCompanyLogo(event){
    const file=event.target.files?.[0];
    if(!file)return;
    if(file.size>1024*1024){setMessage("ط­ط¬ظ… ط§ظ„ط´ط¹ط§ط± ظٹط¬ط¨ ط£ظ† ظٹظƒظˆظ† ط£ظ‚ظ„ ظ…ظ† 1 MB");return}
    const reader=new FileReader();
    reader.onload=()=>setCompanyProfile(current=>({...current,logoDataUrl:String(reader.result||"")}));
    reader.readAsDataURL(file);
  }

  async function saveCompanyProfile(event){
    event.preventDefault();setMessage("");setCompanySaving(true);
    try{
      const {data}=await api.patch("/company-profile",companyProfile);
      setCompanyProfile(data);
      const currentUser={...savedUser,companyName:data.name};
      localStorage.setItem("afs_user",JSON.stringify(currentUser));
      window.dispatchEvent(new CustomEvent("alaboud-company-updated",{detail:data}));
      setMessage("طھظ… ط­ظپط¸ ط§ط³ظ… ظˆط´ط¹ط§ط± ط§ظ„ط´ط±ظƒط© ط¨ظ†ط¬ط§ط­");
    }catch(error){setMessage(error.response?.data?.message||"طھط¹ط°ط± ط­ظپط¸ ظ‡ظˆظٹط© ط§ظ„ط´ط±ظƒط©")}
    finally{setCompanySaving(false)}
  }

  useEffect(()=>{
    document.documentElement.lang=language;
    document.documentElement.dir=language==="ar"?"rtl":"ltr";
    window.dispatchEvent(new Event("alaboud-language-change"));
    document.body.classList.remove("display-compact","display-comfortable","display-large");
    document.body.classList.add(`display-${displayMode}`);
  },[]);

  function savePreferences(){
    localStorage.setItem("alaboud_language",language);
    localStorage.setItem("alaboud_display_mode",displayMode);
    localStorage.setItem("alaboud_primary_currency",currency);

    document.documentElement.lang=language;
    document.documentElement.dir=language==="ar"?"rtl":"ltr";
    document.body.classList.remove("display-compact","display-comfortable","display-large");
    document.body.classList.add(`display-${displayMode}`);

    setMessage(language==="ar"?"طھظ… ط­ظپط¸ ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„ط¹ط±ط¶":"Display settings saved");
  }

  async function createAccount(event){
    event.preventDefault();
    setMessage("");
    try{
      await api.post("/users",accountForm);
      setAccountForm({name:"",email:"",password:"",role:"USER"});
      setMessage("طھظ… ط¥ظ†ط´ط§ط، ط§ظ„ط­ط³ط§ط¨ ط¨ظ†ط¬ط§ط­");
    }catch(error){
      setMessage(error.response?.data?.message||"طھط¹ط°ط± ط¥ظ†ط´ط§ط، ط§ظ„ط­ط³ط§ط¨");
    }
  }

  async function changePassword(event){
    event.preventDefault();
    setMessage("");
    if(passwordForm.newPassword!==passwordForm.confirmPassword){
      setMessage("طھط£ظƒظٹط¯ ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± ط؛ظٹط± ظ…ط·ط§ط¨ظ‚");
      return;
    }

    try{
      const response=await api.post("/auth/change-password",{
        currentPassword:passwordForm.currentPassword,
        newPassword:passwordForm.newPassword
      });
      setPasswordForm({currentPassword:"",newPassword:"",confirmPassword:""});
      setMessage(response.data?.message||"طھظ… طھط؛ظٹظٹط± ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط±");
    }catch(error){
      setMessage(error.response?.data?.message||"طھط¹ط°ط± طھط؛ظٹظٹط± ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط±");
    }
  }

  async function checkUpdates(){
    setUpdateInfo(current=>({...current,checking:true,status:"ط¬ط§ط±ظٹ ط§ظ„طھط­ظ‚ظ‚..."}));
    try{
      const response=await api.get("/health");
      const serverVersion=response.data?.version||"ط؛ظٹط± ظ…ط¹ط±ظˆظپ";
      setUpdateInfo({
        checking:false,
        status:`ط§ظ„ط®ط¯ظ…ط© طھط¹ظ…ظ„ ط¨ط´ظƒظ„ ط·ط¨ظٹط¹ظٹ â€” ط¥طµط¯ط§ط± ط§ظ„ط®ط§ط¯ظ… ${serverVersion}`,
        version:"v16.0.13 Enterprise"
      });
    }catch{
      setUpdateInfo(current=>({...current,checking:false,status:"طھط¹ط°ط± ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ط­ط§ظ„ط© ط§ظ„طھط­ط¯ظٹط«"}));
    }
  }

  const labels=language==="ar"
    ?{
      title:"ط§ظ„ط¥ط¹ط¯ط§ط¯ط§طھ",
      language:"ط§ظ„ظ„ط؛ط©",
      arabic:"ط§ظ„ط¹ط±ط¨ظٹط©",
      english:"English",
      display:"ط·ط±ظٹظ‚ط© ط§ظ„ط¹ط±ط¶",
      compact:"ظ…ط¶ط؛ظˆط·",
      comfortable:"ظ…ط±ظٹط­",
      large:"ظƒط¨ظٹط±",
      currency:"ط§ظ„ط¹ظ…ظ„ط© ط§ظ„ط±ط¦ظٹط³ظٹط©",
      save:"ط­ظپط¸ ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„ط¹ط±ط¶"
    }
    :{
      title:"Settings",
      language:"Language",
      arabic:"ط§ظ„ط¹ط±ط¨ظٹط©",
      english:"English",
      display:"Display mode",
      compact:"Compact",
      comfortable:"Comfortable",
      large:"Large",
      currency:"Primary currency",
      save:"Save display settings"
    };

  return <section className="settings-page">
    <div className="settings-hero">
      <div>
        <span className="settings-hero-icon">âڑ™ï¸ڈ</span>
        <div>
          <h2>{labels.title}</h2>
          <p>ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ط§ظ„طھط¬ط§ط±ظٹط© â€” ط¥ط¯ط§ط±ط© طھظپط¶ظٹظ„ط§طھ ط§ظ„ط¨ط±ظ†ط§ظ…ط¬ ظˆط§ظ„ط­ط³ط§ط¨</p>
        </div>
      </div>
      <span className="settings-version">v16.0.13 Enterprise</span>
    </div>

    {message&&<div className="card settings-message">{message}</div>}

    <div className="settings-grid">
      <article className="settings-card">
        <div className="settings-card-title"><span>ًںŒگ</span><h3>{labels.language}</h3></div>
        <div className="settings-choice-grid">
          <button type="button" className={language==="ar"?"selected":""} onClick={()=>setLanguage("ar")}>ط§ظ„ط¹ط±ط¨ظٹط©</button>
          <button type="button" className={language==="en"?"selected":""} onClick={()=>setLanguage("en")}>English</button>
        </div>

        <div className="settings-card-title settings-subtitle"><span>ًں–¥ï¸ڈ</span><h3>{labels.display}</h3></div>
        <div className="settings-choice-grid three">
          <button type="button" className={displayMode==="compact"?"selected":""} onClick={()=>setDisplayMode("compact")}>{labels.compact}</button>
          <button type="button" className={displayMode==="comfortable"?"selected":""} onClick={()=>setDisplayMode("comfortable")}>{labels.comfortable}</button>
          <button type="button" className={displayMode==="large"?"selected":""} onClick={()=>setDisplayMode("large")}>{labels.large}</button>
        </div>

        <label className="settings-label">{labels.currency}</label>
        <select value={currency} onChange={e=>setCurrency(e.target.value)}>
          {["CAD","USD","EUR","GBP","AED","TRY","SYP"].map(code=><option key={code} value={code}>{code}</option>)}
        </select>

        <button className="settings-primary-button" type="button" onClick={savePreferences}>{labels.save}</button>
      </article>

      <article className="settings-card settings-alerts-embedded">
        <div className="settings-card-title"><span>ًں””</span><h3>ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„طھظ†ط¨ظٹظ‡ط§طھ ظˆظˆط§طھط³ط§ط¨</h3></div>
        <NotificationSettings embedded />
      </article>

      <article className="settings-card company-branding-settings">
        <div className="settings-card-title"><span>ًںڈ¢</span><h3>ظ…ط¹ظ„ظˆظ…ط§طھ ظˆظ‡ظˆظٹط© ط§ظ„ط´ط±ظƒط©</h3></div>
        <p className="settings-help">ط§ط³ظ… ظˆط´ط¹ط§ط± ظ…ط³طھظ‚ظ„ط§ظ† ظ„ظ‡ط°ظ‡ ط§ظ„ط´ط±ظƒط© ظˆظٹط¸ظ‡ط±ط§ظ† ط¹ظ„ظ‰ ط¬ظ…ظٹط¹ ط§ظ„ط£ط¬ظ‡ط²ط© ط¹ظ†ط¯ طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„ ط¨ظ†ظپط³ ط§ظ„ط­ط³ط§ط¨.</p>
        <form className="settings-form-modern" onSubmit={saveCompanyProfile}>
          <div className="company-logo-preview">
            <img src={companyProfile.logoDataUrl||"/alaboud-company-logo.webp"} alt={companyProfile.name||"ط´ط¹ط§ط± ط§ظ„ط´ط±ظƒط©"}/>
          </div>
          <input value={companyProfile.name||""} onChange={e=>setCompanyProfile({...companyProfile,name:e.target.value})} placeholder="ط§ط³ظ… ط§ظ„ط´ط±ظƒط©" required/>
          <input value={companyProfile.phone||""} onChange={e=>setCompanyProfile({...companyProfile,phone:e.target.value})} placeholder="ط±ظ‚ظ… ظ‡ط§طھظپ ط§ظ„ط´ط±ظƒط©"/>
          <label className="company-logo-upload">ًں–¼ï¸ڈ ط§ط®طھظٹط§ط± ظ„ظˆط؛ظˆ ط§ظ„ط´ط±ظƒط©
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseCompanyLogo}/>
          </label>
          {companyProfile.logoDataUrl&&<button type="button" className="company-logo-remove" onClick={()=>setCompanyProfile({...companyProfile,logoDataUrl:""})}>ط­ط°ظپ ط§ظ„ط´ط¹ط§ط± ط§ظ„ط­ط§ظ„ظٹ</button>}
          <button disabled={companySaving}>{companySaving?"ط¬ط§ط±ظٹ ط§ظ„ط­ظپط¸...":"ط­ظپط¸ ط§ط³ظ… ظˆط´ط¹ط§ط± ط§ظ„ط´ط±ظƒط©"}</button>
        </form>
      </article>

      <article className="settings-card">
        <div className="settings-card-title"><span>ًں‘¤</span><h3>ط¥ظ†ط´ط§ط، ط­ط³ط§ط¨</h3></div>
        <p className="settings-help">ط§ظ„ط­ط³ط§ط¨ ط§ظ„ط­ط§ظ„ظٹ: {savedUser.name||savedUser.email||"ظ…ط¯ظٹط± ط§ظ„ظ†ط¸ط§ظ…"}</p>
        <form className="settings-form-modern" onSubmit={createAccount}>
          <input value={accountForm.name} onChange={e=>setAccountForm({...accountForm,name:e.target.value})} placeholder="ط§ط³ظ… ط§ظ„ظ…ط³طھط®ط¯ظ…" required/>
          <input type="email" value={accountForm.email} onChange={e=>setAccountForm({...accountForm,email:e.target.value})} placeholder="ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ" required/>
          <input type="password" value={accountForm.password} onChange={e=>setAccountForm({...accountForm,password:e.target.value})} placeholder="ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± â€” 8 ط£ط­ط±ظپ ط¹ظ„ظ‰ ط§ظ„ط£ظ‚ظ„" required/>
          <select value={accountForm.role} onChange={e=>setAccountForm({...accountForm,role:e.target.value})}>
            <option value="USER">ظ…ط³طھط®ط¯ظ…</option>
            <option value="MANAGER">ظ…ط¯ظٹط±</option>
            <option value="ADMIN">ظ…ط³ط¤ظˆظ„ ظƒط§ظ…ظ„</option>
          </select>
          <button>ط¥ظ†ط´ط§ط، ط§ظ„ط­ط³ط§ط¨</button>
        </form>
      </article>

      <article className="settings-card">
        <div className="settings-card-title"><span>ًں”گ</span><h3>طھط؛ظٹظٹط± ظƒظ„ظ…ط© ط§ظ„ط³ط±</h3></div>
        <form className="settings-form-modern" onSubmit={changePassword}>
          <input type="password" value={passwordForm.currentPassword} onChange={e=>setPasswordForm({...passwordForm,currentPassword:e.target.value})} placeholder="ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± ط§ظ„ط­ط§ظ„ظٹط©" required/>
          <input type="password" value={passwordForm.newPassword} onChange={e=>setPasswordForm({...passwordForm,newPassword:e.target.value})} placeholder="ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± ط§ظ„ط¬ط¯ظٹط¯ط©" required/>
          <input type="password" value={passwordForm.confirmPassword} onChange={e=>setPasswordForm({...passwordForm,confirmPassword:e.target.value})} placeholder="طھط£ظƒظٹط¯ ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± ط§ظ„ط¬ط¯ظٹط¯ط©" required/>
          <button>طھط؛ظٹظٹط± ظƒظ„ظ…ط© ط§ظ„ط³ط±</button>
        </form>
      </article>

      <article className="settings-card">
        <div className="settings-card-title"><span>ًں›ں</span><h3>ط§ظ„ط¯ط¹ظ… ط§ظ„ظپظ†ظٹ</h3></div>
        <p className="settings-help">ط¹ظ†ط¯ ط­ط¯ظˆط« ظ…ط´ظƒظ„ط©طŒ ط£ط±ط³ظ„ طµظˆط±ط© ط§ظ„ط®ط·ط£ ظˆط±ظ‚ظ… ط§ظ„ط¥طµط¯ط§ط± ط§ظ„ط¸ط§ظ‡ط± ظپظٹ ط§ظ„ط¨ط±ظ†ط§ظ…ط¬.</p>
        <div className="support-actions">
          <a href="mailto:support@alaboud.local?subject=ALABOUD%20Business%20Suite%20Support">âœ‰ï¸ڈ ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ظپظ†ظٹ</a>
          <button type="button" onClick={()=>navigator.clipboard?.writeText("v16.0.13 Enterprise").then(()=>setMessage("طھظ… ظ†ط³ط® ط±ظ‚ظ… ط§ظ„ط¥طµط¯ط§ط±"))}>ًں“‹ ظ†ط³ط® ط±ظ‚ظ… ط§ظ„ط¥طµط¯ط§ط±</button>
        </div>
      </article>

      <article className="settings-card settings-updates-card">
        <div className="settings-card-title"><span>â¬†ï¸ڈ</span><h3>ط§ظ„طھط­ط¯ظٹط«ط§طھ</h3></div>
        <div className="update-current-version">
          <span>ط§ظ„ط¥طµط¯ط§ط± ط§ظ„ط­ط§ظ„ظٹ</span>
          <strong>{updateInfo.version}</strong>
        </div>
        <p className="settings-help">{updateInfo.status||"ط§ط¶ط؛ط· ظ„ظ„طھط­ظ‚ظ‚ ظ…ظ† ط­ط§ظ„ط© ط§ظ„ط®ط¯ظ…ط© ظˆط§ظ„طھط­ط¯ظٹط«."}</p>
        <button type="button" className="settings-primary-button" onClick={checkUpdates} disabled={updateInfo.checking}>
          {updateInfo.checking?"ط¬ط§ط±ظٹ ط§ظ„طھط­ظ‚ظ‚...":"ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ط§ظ„طھط­ط¯ظٹط«ط§طھ"}
        </button>
      </article>
    </div>
  </section>;
}

function Simple({type}){const[list,setList]=useState([]),[title,setTitle]=useState(""),[amount,setAmount]=useState(""),[move,setMove]=useState("IN");const endpoint=type==="expenses"?"/expenses":"/capital";const load=()=>api.get(endpoint).then(r=>setList(r.data));useEffect(()=>{load();},[type]);async function add(e){e.preventDefault();await api.post(endpoint,type==="expenses"?{title,amount}:{type:move,amount,description:title});setTitle("");setAmount("");load();}return <><h2>{type==="expenses"?"ط§ظ„ظ…طµط±ظˆظپط§طھ":"ط±ط£ط³ ط§ظ„ظ…ط§ظ„"}</h2><form className="card form" onSubmit={add}>{type==="capital"&&<select value={move} onChange={e=>setMove(e.target.value)}><option value="IN">ط²ظٹط§ط¯ط©</option><option value="OUT">ط³ط­ط¨</option></select>}<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="ط§ظ„ظˆطµظپ" required/><input type="number" step=".01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="ط§ظ„ظ…ط¨ظ„ط؛" required/><button>ط­ظپط¸</button></form><div className="card tablewrap"><table><tbody>{list.map(x=><tr key={x.id}><td>{x.date}</td><td>{x.title||x.description}</td><td>{x.type||x.category}</td><td>{money(x.amount)}</td></tr>)}</tbody></table></div></>}
export default function App(){
  const sessionFixVersion="16.0.0";
  const savedSessionFix=localStorage.getItem("alaboud_session_fix_version");

  if(savedSessionFix!==sessionFixVersion){
    localStorage.removeItem("afs_token");
    localStorage.removeItem("afs_user");
    localStorage.setItem("alaboud_session_fix_version",sessionFixVersion);
  }

  const [token,setToken]=useState(localStorage.getItem("afs_token"));
  const savedCompanyUser=(()=>{try{return JSON.parse(localStorage.getItem("afs_user")||"{}")}catch{return {}}})();
  const [companyBrand,setCompanyBrand]=useState({name:savedCompanyUser.companyName||"ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ط§ظ„طھط¬ط§ط±ظٹط©",logoDataUrl:""});

  useEffect(()=>{
    if(!token)return;

    api.get("/auth/session").then(({data})=>{
      localStorage.setItem("afs_user",JSON.stringify(data.user));
      window.dispatchEvent(new CustomEvent("alaboud-live-session",{detail:data}));
    }).catch(()=>{});

    api.get("/company-profile").then(({data})=>setCompanyBrand(data)).catch(()=>{});
    const updateCompany=event=>setCompanyBrand(event.detail);
    window.addEventListener("alaboud-company-updated",updateCompany);
    return()=>window.removeEventListener("alaboud-company-updated",updateCompany);
  },[token]);

  useEffect(()=>{
    const handleAuthExpired=()=>setToken(null);
    window.addEventListener("alaboud-auth-expired",handleAuthExpired);
    return()=>window.removeEventListener("alaboud-auth-expired",handleAuthExpired);
  },[]);
  const [page,setPage]=useState("dashboard");
  const [customerId,setCustomerId]=useState(null);
  const [invoiceId,setInvoiceId]=useState(null);
  const [statementCustomerId,setStatementCustomerId]=useState(null);
  const [partnerId,setPartnerId]=useState(null);
  const [overdueCount,setOverdueCount]=useState(0);
  const [logoutConfirm,setLogoutConfirm]=useState(false);
  const [mobileMenuOpen,setMobileMenuOpen]=useState(
    typeof window!=="undefined" ? window.matchMedia("(max-width: 800px)").matches : false
  );

  // Always open the mobile menu from the top so the company logo is visible.
  useEffect(()=>{
    if(!mobileMenuOpen)return;
    requestAnimationFrame(()=>{
      const menuPanel=document.querySelector(".app.mobile-menu-view aside");
      if(menuPanel)menuPanel.scrollTop=0;
      window.scrollTo({top:0,left:0,behavior:"auto"});
    });
  },[mobileMenuOpen]);

  useEffect(()=>{
    if(token){
      api.get("/customer-alerts")
        .then(response=>setOverdueCount(Number(response.data?.count||0)))
        .catch(()=>setOverdueCount(0));
    }
  },[token,page,customerId]);

  useEffect(()=>{
    if(typeof window==="undefined")return;
    const onBack=()=>{
      if(mobileMenuOpen){
        setMobileMenuOpen(false);
        history.pushState(null,"",location.href);
      }
    };
    history.pushState(null,"",location.href);
    window.addEventListener("popstate",onBack);
    return()=>window.removeEventListener("popstate",onBack);
  },[mobileMenuOpen]);

  if(!token){
    return <Login onLogin={()=>setToken(localStorage.getItem("afs_token"))}/>;
  }

  function navigate(nextPage){
    setPage(nextPage);
    setCustomerId(null);
    setInvoiceId(null);
    setStatementCustomerId(null);
    setPartnerId(null);
    if(typeof window!=="undefined"&&window.matchMedia("(max-width: 800px)").matches){
      setMobileMenuOpen(false);
      window.scrollTo({top:0,behavior:"smooth"});
    }
  }

  let content;
  if(invoiceId){
    content=<Invoice transactionId={invoiceId} back={()=>setInvoiceId(null)}/>;
  }else if(statementCustomerId){
    content=<Statement customerId={statementCustomerId} back={()=>setStatementCustomerId(null)}/>;
  }else if(customerId){
    content=<Customer id={customerId} back={()=>setCustomerId(null)} onStatement={setStatementCustomerId}/>;
  }else if(partnerId){
    content=<PartnerProfile id={partnerId} back={()=>setPartnerId(null)}/>;
  }else if(page==="dashboard"){
    content=<Dashboard navigate={navigate}/>;
  }else if(page==="customers"){
    content=<Customers open={setCustomerId}/>;
  }else if(page==="overdue-customers"){
    content=<Customers open={setCustomerId}/>;
  }else if(page==="partners"){
    content=<Partners open={setPartnerId}/>;
  }else if(page==="transactions"){
    content=<Transactions openInvoice={setInvoiceId}/>;
  }else if(page==="profits"){
    content=<Profits/>;
  }else if(page==="rates"){
    content=<ExchangeRates/>;
  }else if(page==="debts"){
    content=<GeneralDebts/>;
  }else if(page==="capital-overview"||page==="capital"){
    content=<CapitalOverview/>;
  }else if(page==="monthly-report"){
    content=<MonthlyReport/>;
  }else if(page==="notification-settings"){
    content=<SettingsPanel/>;
  }else if(page==="settings"){
    content=<SettingsPanel/>;
  }else if(page==="expenses"){
    content=<Simple type="expenses"/>;
  }else{
    content=<Simple type="capital"/>;
  }

  const showHomeButton =
    page !== "dashboard" ||
    Boolean(customerId) ||
    Boolean(invoiceId) ||
    Boolean(statementCustomerId) ||
    Boolean(partnerId);

  const menu=[
    ["dashboard","âŒ‚ ط§ظ„ظ‚ط§ط¦ظ…ط© ط§ظ„ط±ط¦ظٹط³ظٹط©"],
    ["customers",`ًں‘¥ ط§ظ„ط¹ظ…ظ„ط§ط،${overdueCount?` â€” ظ…طھط£ط®ط±ظˆظ† (${overdueCount})`:""}`],
    ["partners","ًںڈ¢ ط§ظ„ط´ط±ظƒط§طھ"],
    ["transactions","â‡„ ط§ظ„ط­ظˆط§ظ„ط§طھ"],
    ["expenses","ًں§¾ ط§ظ„ظ…طµط±ظˆظپط§طھ"],
    ["profits","ًں“ˆ ط§ظ„ط£ط±ط¨ط§ط­"],
    ["rates","ًں’± ط§ظ„ط¹ظ…ظ„ط§طھ ظˆط£ط³ط¹ط§ط± ط§ظ„طµط±ظپ"],
    ["debts","ًں“’ ط§ظ„ط¯ظ‘ظژظٹظ† ط§ظ„ط¹ط§ظ…"],
    ["capital-overview","âڑ–ï¸ڈ ط§ظ„ظ…ظٹط²ط§ظ†ظٹط©"],
    ["monthly-report","ًں“ٹ ط§ظ„طھظ‚ط§ط±ظٹط± ط§ظ„ط´ظ‡ط±ظٹط©"],
    ["settings","âڑ™ï¸ڈ ط§ظ„ط¥ط¹ط¯ط§ط¯ط§طھ ظˆط§ظ„طھظ†ط¨ظٹظ‡ط§طھ"]
  ];

  return <><AppLanguageBridge/><div className={`app ${mobileMenuOpen?"mobile-menu-view":"mobile-page-view"}`}>
    <div className="mobile-page-header no-print">
      <button className="mobile-header-action mobile-menu-action" onClick={()=>setMobileMenuOpen(true)} aria-label="ظپطھط­ ط§ظ„ظ‚ط§ط¦ظ…ط©">
        <span className="mobile-header-icon">âک°</span><span>ط§ظ„ظ‚ط§ط¦ظ…ط©</span>
      </button>
      <div className="mobile-brand-center">
        <img className="mobile-header-logo" src={companyBrand.logoDataUrl||"/alaboud-company-logo.webp"} alt={companyBrand.name}/>
        <div className="mobile-brand-copy">
          <strong>{companyBrand.name}</strong>
          <small>v16.0.13 Enterprise</small>
        </div>
      </div>
      <button className="mobile-header-action mobile-home-action" onClick={()=>setMobileMenuOpen(true)} aria-label="ط§ظ„ظ‚ط§ط¦ظ…ط© ط§ظ„ط±ط¦ظٹط³ظٹط©">
        <span className="mobile-header-icon">âŒ‚</span><span>ط§ظ„ط±ط¦ظٹط³ظٹط©</span>
      </button>
    </div>
    <aside>
      <div className="mobile-menu-heading no-print">
        <img className="alaboud-sidebar-logo mobile-logo" src={companyBrand.logoDataUrl||"/alaboud-company-logo.webp"} alt={companyBrand.name} />
        <button onClick={()=>setMobileMenuOpen(false)}>âœ•</button>
      </div>
      <div className="sidebar-logo-wrap"><img className="alaboud-sidebar-logo" src={companyBrand.logoDataUrl||"/alaboud-company-logo.webp"} alt={companyBrand.name} /></div>
      <div className="sidebar-account-box no-print">
        <div>
          <strong>{companyBrand.name}</strong>
          <small>v16.0.13 Enterprise</small>
        </div>
      </div>
      {menu.map(([key,label])=><button
        key={key}
        className={page===key&&!customerId&&!invoiceId&&!statementCustomerId&&!partnerId?"active":""}
        onClick={()=>navigate(key)}
      >{label}</button>)}
      <button className="logout-top sidebar-logout-bottom" onClick={()=>setLogoutConfirm(true)}>ًںڑھ طھط³ط¬ظٹظ„ ط§ظ„ط®ط±ظˆط¬</button>
      {logoutConfirm&&<div className="logout-confirm-overlay no-print" onClick={()=>setLogoutConfirm(false)}>
        <div className="logout-confirm-card" onClick={e=>e.stopPropagation()}>
          <h3>طھط³ط¬ظٹظ„ ط§ظ„ط®ط±ظˆط¬</h3>
          <p>ظ‡ظ„ طھط±ظٹط¯ طھط³ط¬ظٹظ„ ط§ظ„ط®ط±ظˆط¬ ظ…ظ† ط§ظ„ط¨ط±ظ†ط§ظ…ط¬طں</p>
          <div>
            <button className="danger-button" onClick={()=>{
              localStorage.clear();
              setToken(null);
              setLogoutConfirm(false);
            }}>ظ†ط¹ظ…طŒ طھط³ط¬ظٹظ„ ط§ظ„ط®ط±ظˆط¬</button>
            <button onClick={()=>setLogoutConfirm(false)}>ط¥ظ„ط؛ط§ط،</button>
          </div>
        </div>
      </div>}
    </aside>
    <main className="app-main-content">
      <AppErrorBoundary key={`${page}-${customerId}-${invoiceId}-${statementCustomerId}-${partnerId}`}>
        {content}
      </AppErrorBoundary>
      {showHomeButton&&<div className="home-return-bar home-return-bottom no-print">
        <button className="home-return-button" onClick={()=>navigate("dashboard")}>
          â¬… ط§ظ„ط°ظ‡ط§ط¨ ط¥ظ„ظ‰ ط§ظ„ظ‚ط§ط¦ظ…ط© ط§ظ„ط±ط¦ظٹط³ظٹط©
        </button>
      </div>}
    </main>
    <nav className="mobile-bottom-nav no-print" aria-label="ط§ظ„طھظ†ظ‚ظ„ ط§ظ„ط³ط±ظٹط¹">
      <button className={page==="customers"?"active":""} onClick={()=>navigate("customers")}>
        <span>ًں‘¥</span><small>ط§ظ„ط¹ظ…ظ„ط§ط،</small>
      </button>
      <button className={page==="transactions"?"active":""} onClick={()=>navigate("transactions")}>
        <span>â‡„</span><small>ط§ظ„ط­ظˆط§ظ„ط§طھ</small>
      </button>
      <button className={page==="dashboard"?"active":""} onClick={()=>navigate("dashboard")}>
        <span>âŒ‚</span><small>ط§ظ„ط±ط¦ظٹط³ظٹط©</small>
      </button>
      <button className={page==="monthly-report"?"active":""} onClick={()=>navigate("monthly-report")}>
        <span>â–¥</span><small>ط§ظ„طھظ‚ط§ط±ظٹط±</small>
      </button>
      <button onClick={()=>setMobileMenuOpen(true)}>
        <span>â€¢â€¢â€¢</span><small>ط§ظ„ظ…ط²ظٹط¯</small>
      </button>
    </nav>
  </div></>;
}

