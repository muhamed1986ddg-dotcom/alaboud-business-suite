import React,{useEffect,useState}from"react";import api from"./api";
const money=n=>Number(n||0).toFixed(2);
const cad=n=>`${money(n)} CAD`;
const rateTrendPoints=(rate,index=0)=>{
  const base=Number(rate||1);
  const values=Array.from({length:18},(_,i)=>{
    const wave=Math.sin((i+index)*0.85)*0.009;
    const drift=(i-9)*0.00055;
    return base*(1+wave+drift);
  });
  const min=Math.min(...values),max=Math.max(...values);
  return values.map((value,i)=>{
    const x=(i/(values.length-1))*100;
    const y=28-((value-min)/(max-min||1))*22;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
};

const currencyFlag=code=>({
  USD:"ًں‡؛ًں‡¸",
  EUR:"ًں‡ھًں‡؛",
  SYP:"ًں‡¸ًں‡¾",
  AED:"ًں‡¦ًں‡ھ",
  GBP:"ًں‡¬ًں‡§",
  CAD:"ًں‡¨ًں‡¦"
}[String(code||"").toUpperCase()]||"ًں’±");

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

function Login({onLogin}){const[email,setEmail]=useState("admin@alaboud.local"),[password,setPassword]=useState("Admin123!"),[error,setError]=useState("");async function submit(e){e.preventDefault();try{const{data}=await api.post("/auth/login",{email,password});localStorage.setItem("afs_token",data.token);localStorage.setItem("afs_user",JSON.stringify(data.user));onLogin();}catch{setError("ظپط´ظ„ طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„");}}return <div className="login"><form className="panel" onSubmit={submit}><img className="login-company-logo" src="/alaboud-company-logo.webp" alt="ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ط§ظ„طھط¬ط§ط±ظٹط©"/><h1>ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ط§ظ„طھط¬ط§ط±ظٹط©</h1><p className="login-company-en">ALABOUD TRADING COMPANY</p><p>ط¥ط¯ط§ط±ط© ط§ظ„ط­ظˆط§ظ„ط§طھ ظˆط§ظ„ط­ط³ط§ط¨ط§طھ</p><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="ط§ظ„ط¨ط±ظٹط¯"/><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط±"/>{error&&<div className="error">{error}</div>}<button>طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„</button><small>admin@alaboud.local / Admin123!</small></form></div>}
function Dashboard({navigate}){
  const [data,setData]=useState(null);
  const [noticeData,setNoticeData]=useState({count:0,overdueCount:0,overdueTotal:0,notifications:[]});
  const [recent,setRecent]=useState([]);
  const [rates,setRates]=useState([]);
  const [ratesBusy,setRatesBusy]=useState(false);
  const [open,setOpen]=useState(false);

  const loadRates=()=>api.get("/exchange-rates").then(response=>{
    const rows=Array.isArray(response.data)?response.data:[];
    setRates(rows.filter(item=>String(item.quoteCurrency||"").toUpperCase()==="CAD"));
  });

  useEffect(()=>{
    Promise.all([
      api.get("/dashboard"),
      api.get("/notifications"),
      api.get("/transactions"),
      loadRates()
    ]).then(([dashboardResponse,notificationResponse,transactionsResponse])=>{
      setData(dashboardResponse.data);
      setNoticeData(notificationResponse.data);
      const rows=Array.isArray(transactionsResponse.data)?transactionsResponse.data:[];
      setRecent(rows.slice().sort((a,b)=>new Date(b.createdAt||b.transferDate)-new Date(a.createdAt||a.transferDate)).slice(0,4));
    });

    const timer=setInterval(()=>loadRates().catch(()=>{}),60000);
    return()=>clearInterval(timer);
  },[]);

  const refreshRates=async()=>{
    setRatesBusy(true);
    try{
      await api.post("/exchange-rates/refresh");
      await loadRates();
    }finally{
      setRatesBusy(false);
    }
  };

  if(!data)return <div className="premium-loading">ط¬ط§ط±ظٹ طھط­ظ…ظٹظ„ ظ„ظˆط­ط© ط§ظ„طھط­ظƒظ…â€¦</div>;

  const kpis=[
    {label:"ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط­ظˆط§ظ„ط§طھ",value:data.todayTransactions||0,icon:"ًں’±",tone:"green",note:"ط­ظˆط§ظ„ط§طھ ط§ظ„ظٹظˆظ…"},
    {label:"ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط£ط±ط¨ط§ط­",value:cad(data.todayProfit),icon:"ًں“ˆ",tone:"blue",note:"ط§ظ„ط±ط¨ط­ ط§ظ„ظٹظˆظ…ظٹ"},
    {label:"ط§ظ„ظ…طµط±ظˆظپط§طھ",value:cad(data.todayExpenses||0),icon:"ًں‘›",tone:"orange",note:"ظ…طµط±ظˆظپط§طھ ط§ظ„ظٹظˆظ…"},
    {label:"ط§ظ„ط¹ظ…ظ„ط§ط،",value:data.customers||0,icon:"ًں‘¥",tone:"purple",note:`${noticeData.overdueCount||0} ظ…طھط£ط®ط±`}
  ];

  return <div className="premium-dashboard">
    <section className="premium-hero">
      <img src="/alaboud-company-logo.webp" alt="ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ط§ظ„طھط¬ط§ط±ظٹط©"/>
      <div>
        <h2>ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ط§ظ„طھط¬ط§ط±ظٹط©</h2>
        <p>v15.3.5 Final</p>
      </div>
      <span className="online-chip">â—ڈ ظ…طھطµظ„</span>
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

    <section className="premium-grid premium-grid-v15">
      <div className="premium-recent panel-dark">
        <div className="section-heading">
          <h3>ط£ط­ط¯ط« ط§ظ„ط­ظˆط§ظ„ط§طھ</h3>
          <button onClick={()=>navigate("transactions")}>ط¹ط±ط¶ ط§ظ„ظƒظ„</button>
        </div>
        {recent.length?recent.map(item=><button className="recent-row" key={item.id} onClick={()=>navigate("transactions")}>
          <div className="recent-currency"><span className="currency-flag">{currencyFlag(item.currency)}</span><div><span>{item.currency||"USD"}</span><small>{item.number||"ط­ظˆط§ظ„ط©"}</small></div></div>
          <div className="recent-date">{item.transferDate||String(item.createdAt||"").slice(0,10)}</div>
          <strong>{cad(item.totalCustomerDue||0)}</strong>
          <b>â€¹</b>
        </button>):<p className="empty-state">ظ„ط§ طھظˆط¬ط¯ ط­ظˆط§ظ„ط§طھ ط­ط¯ظٹط«ط©.</p>}
      </div>

      <div className="enterprise-rates-board panel-dark">
        <div className="enterprise-rates-head">
          <div>
            <h3>ًں“ˆ ط£ط³ط¹ط§ط± ط§ظ„طµط±ظپ ط§ظ„ظ„ط­ط¸ظٹط©</h3>
            <p>ظ…ظ‚ط§ط¨ظ„ ط§ظ„ط¯ظˆظ„ط§ط± ط§ظ„ظƒظ†ط¯ظٹ <strong>CAD</strong></p>
          </div>
          <div className="rates-head-actions">
            <span>ط¢ط®ط± طھط­ط¯ظٹط«<br/><strong>{rates[0]?.createdAt?new Date(rates[0].createdAt).toLocaleString("ar-CA"):"â€”"}</strong></span>
            <button disabled={ratesBusy} onClick={refreshRates}>{ratesBusy?"ط¬ط§ط±ظٹ ط§ظ„طھط­ط¯ظٹط«â€¦":"â†» طھط­ط¯ظٹط« ط§ظ„ط£ط³ط¹ط§ط±"}</button>
          </div>
        </div>

        <div className="enterprise-rates-table">
          <div className="rate-table-header">
            <span>ط§ظ„ط¹ظ…ظ„ط©</span>
            <span>ط§ظ„ط¹ظ„ظ…</span>
            <span>ط³ط¹ط± ط§ظ„ط´ط±ط§ط،</span>
            <span>ط³ط¹ط± ط§ظ„ط¨ظٹط¹</span>
            <span>ط§ظ„طھط؛ظٹط± 24 ط³ط§ط¹ط©</span>
            <span>ط§ظ„ط±ط³ظ… ط§ظ„ط¨ظٹط§ظ†ظٹ</span>
          </div>

          {rates.length?rates.slice(0,6).map((item,index)=>{
            const code=String(item.baseCurrency||"").toUpperCase();
            const buy=Number(item.buyRate||item.rate||0);
            const sell=Number(item.sellRate||item.rate||0);
            const delta=((sell-buy)/(buy||1))*100;
            const up=delta>=0;
            return <button key={item.id||`${code}-CAD`} className="enterprise-rate-row" onClick={()=>navigate("rates")}>
              <span className="enterprise-code"><strong>{code}</strong><small>{code==="USD"?"ط¯ظˆظ„ط§ط± ط£ظ…ط±ظٹظƒظٹ":code==="EUR"?"ظٹظˆط±ظˆ ط£ظˆط±ظˆط¨ظٹ":code==="SYP"?"ظ„ظٹط±ط© ط³ظˆط±ظٹط©":code==="AED"?"ط¯ط±ظ‡ظ… ط¥ظ…ط§ط±ط§طھظٹ":code==="GBP"?"ط¬ظ†ظٹظ‡ ط¥ط³طھط±ظ„ظٹظ†ظٹ":code==="CAD"?"ط¯ظˆظ„ط§ط± ظƒظ†ط¯ظٹ":"ط¹ظ…ظ„ط©"}</small></span>
              <span className="enterprise-flag">{currencyFlag(code)}</span>
              <span className="rate-buy">{buy.toFixed(code==="SYP"?7:4)}</span>
              <span className="rate-sell">{sell.toFixed(code==="SYP"?7:4)}</span>
              <span className={up?"rate-up":"rate-down"}>{up?"â–²":"â–¼"} {Math.abs(delta).toFixed(2)}%</span>
              <span className="mini-chart">
                <svg viewBox="0 0 100 30" preserveAspectRatio="none">
                  <polyline points={rateTrendPoints(sell,index)} fill="none" stroke="currentColor" strokeWidth="2.2"/>
                </svg>
              </span>
            </button>
          }):<div className="empty-state">ظ„ط§ طھظˆط¬ط¯ ط£ط³ط¹ط§ط± ظ…ط­ظپظˆط¸ط© ط¨ط¹ط¯. ط§ظپطھط­ طµظپط­ط© ط£ط³ط¹ط§ط± ط§ظ„طµط±ظپ ظˆط£ط¶ظپ ط§ظ„ط£ط³ط¹ط§ط±.</div>}
        </div>

        <button className="show-all-rates" onClick={()=>navigate("rates")}>ط¹ط±ط¶ ط¬ظ…ظٹط¹ ط§ظ„ط¹ظ…ظ„ط§طھ â€¹</button>
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

function Customers({open}){
  const [list,setList]=useState([]);
  const [alerts,setAlerts]=useState({count:0,totalOverdue:0,rows:[]});
  const [search,setSearch]=useState("");
  const [error,setError]=useState("");

  const [customerForm,setCustomerForm]=useState({name:"",phone:"",email:""});
  const [editingCustomer,setEditingCustomer]=useState(null);

  const [transferForm,setTransferForm]=useState({
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
  const [selectedRateMeta,setSelectedRateMeta]=useState(null);

  const [paymentForm,setPaymentForm]=useState({
    customerId:"",
    transactionId:"",
    amount:"",
    paymentDate:new Date().toISOString().slice(0,10),
    method:"CASH",
    reference:""
  });

  const [customerTransactions,setCustomerTransactions]=useState([]);
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


  const archiveCustomer=async(customer)=>{
    if(!window.confirm(`ظ‡ظ„ طھط±ظٹط¯ ط£ط±ط´ظپط© ط§ظ„ط¹ظ…ظٹظ„ ${customer.name}طں`))return;
    setMsg("");
    try{
      await api.post(`/customers/${customer.id}/archive`);
      setMsg("طھظ…طھ ط£ط±ط´ظپط© ط§ظ„ط¹ظ…ظٹظ„ ط¨ظ†ط¬ط§ط­.");
      load();
    }catch(error){
      setMsg(error.response?.data?.message||"طھط¹ط°ط± ط£ط±ط´ظپط© ط§ظ„ط¹ظ…ظٹظ„");
    }
  };

  const deleteCustomer=async(customer)=>{
    const firstConfirm=window.confirm(
      `ظ‡ظ„ ط£ظ†طھ ظ…طھط£ظƒط¯ ظ…ظ† ط­ط°ظپ ط§ظ„ط¹ظ…ظٹظ„ ${customer.name}طں\n\nظ„ظ† ظٹط³ظ…ط­ ط§ظ„ظ†ط¸ط§ظ… ط¨ط§ظ„ط­ط°ظپ ط¥ط°ط§ ظƒط§ظ† ظ„ظ„ط¹ظ…ظٹظ„ ط­ظˆط§ظ„ط§طھ ط£ظˆ ط¯ظپط¹ط§طھ ط£ظˆ ط¯ظٹظˆظ†.`
    );
    if(!firstConfirm)return;

    const typed=window.prompt(`ظ„ظ„طھط£ظƒظٹط¯ ط§ظ„ظ†ظ‡ط§ط¦ظٹطŒ ط§ظƒطھط¨ ط§ط³ظ… ط§ظ„ط¹ظ…ظٹظ„ ظƒظ…ط§ ظ‡ظˆ:\n${customer.name}`);
    if(typed!==customer.name){
      setMsg("طھظ… ط¥ظ„ط؛ط§ط، ط§ظ„ط­ط°ظپ ظ„ط£ظ† ط§ط³ظ… ط§ظ„ط¹ظ…ظٹظ„ ط؛ظٹط± ظ…ط·ط§ط¨ظ‚.");
      return;
    }

    setMsg("");
    try{
      await api.delete(`/customers/${customer.id}`);
      setMsg("طھظ… ط­ط°ظپ ط§ظ„ط¹ظ…ظٹظ„ ظ†ظ‡ط§ط¦ظٹظ‹ط§.");
      load();
    }catch(error){
      const response=error.response?.data;
      if(error.response?.status===409){
        const counts=response?.counts||{};
        setMsg(
          `${response?.message||"ظ„ط§ ظٹظ…ظƒظ† ط­ط°ظپ ط§ظ„ط¹ظ…ظٹظ„."} `+
          `(ط­ظˆط§ظ„ط§طھ: ${counts.transactions||0}طŒ ط¯ظپط¹ط§طھ: ${counts.payments||0}طŒ ط¯ظٹظˆظ†: ${counts.debts||0})`
        );
      }else{
        setMsg(response?.message||"طھط¹ط°ط± ط­ط°ظپ ط§ظ„ط¹ظ…ظٹظ„");
      }
    }
  };

  async function addCustomer(event){
    event.preventDefault();
    try{
      await api.post("/customers",customerForm);
      setCustomerForm({name:"",phone:"",email:""});
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
      await api.post("/transactions",{
        ...transferForm,
        amount:Number(transferForm.amount),
        costRate:Number(transferForm.costRate),
        finalRate:Number(transferForm.finalRate),
        transferFee:Number(transferForm.transferFee||0),
        rateSource:transferForm.rateMode==="auto"?"exchange-rates":"manual",
        rateUpdatedAt:transferForm.rateUpdatedAt||selectedRateMeta?.createdAt||null
      });
      setTransferForm({
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
      setSelectedRateMeta(null);
      setActivePanel("");
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± ط¥ط¶ط§ظپط© ط§ظ„ط­ظˆط§ظ„ط©");
    }
  }

  async function preparePayment(customer){
    setPaymentForm({
      customerId:customer.id,
      transactionId:"",
      amount:"",
      paymentDate:new Date().toISOString().slice(0,10),
      method:"CASH",
      reference:""
    });
    try{
      const response=await api.get(`/customers/${customer.id}`);
      const unpaid=(Array.isArray(response.data?.transactions)?response.data.transactions:[])
        .filter(item=>Number(item.remaining||0)>0);
      setCustomerTransactions(unpaid);
      setActivePanel("payment");
      window.scrollTo({top:0,behavior:"smooth"});
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± طھط­ظ…ظٹظ„ ط­ظˆط§ظ„ط§طھ ط§ظ„ط¹ظ…ظٹظ„");
    }
  }

  async function addPayment(event){
    event.preventDefault();
    try{
      await api.post(`/customers/${paymentForm.customerId}/payments`,paymentForm);
      setPaymentForm({
        customerId:"",
        transactionId:"",
        amount:"",
        paymentDate:new Date().toISOString().slice(0,10),
        method:"CASH",
        reference:""
      });
      setCustomerTransactions([]);
      setActivePanel("");
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± ط¥ط¶ط§ظپط© ط§ظ„ط¯ظپط¹ط©");
    }
  }

  function whatsappFinalBalance(customer, urgent=false){
    const phone=String(customer.phone||"").replace(/\D/g,"");
    if(!phone){
      setError("ظ„ط§ ظٹظˆط¬ط¯ ط±ظ‚ظ… ظˆط§طھط³ط§ط¨ ظ…ط­ظپظˆط¸ ظ„ظ‡ط°ط§ ط§ظ„ط¹ظ…ظٹظ„");
      return;
    }

    const message=urgent
      ? `ط§ظ„ط³ظ„ط§ظ… ط¹ظ„ظٹظƒظ… ${customer.name}طŒ
ظ†ط°ظƒظ‘ط±ظƒظ… ط¨ط¶ط±ظˆط±ط© طھط³ط¯ظٹط¯ ط§ظ„ط±طµظٹط¯ ط§ظ„ظ…ط³طھط­ظ‚ ظˆظ‚ط¯ط±ظ‡ ${cad(customer.finalBalance)}.
ط¹ط¯ط¯ ط£ظٹط§ظ… ط§ظ„طھط£ط®ظٹط±: ${customer.overdueDays} ظٹظˆظ….
ظٹط±ط¬ظ‰ ط§ظ„طھظˆط§طµظ„ ظ…ط¹ظ†ط§ ظ„طھط³ظˆظٹط© ط§ظ„ط­ط³ط§ط¨.
ط´ظƒط±ط§ظ‹ ظ„طھط¹ط§ظ…ظ„ظƒظ… ظ…ط¹ ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ظ„ظ„طھط¬ط§ط±ط©.`
      : `ط§ظ„ط³ظ„ط§ظ… ط¹ظ„ظٹظƒظ… ${customer.name}طŒ
ظ…ط¬ظ…ظˆط¹ ط­ط³ط§ط¨ظƒظ… ط§ظ„ظƒظ„ظٹ: ${cad(customer.totalTransactions)}
ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ظ…ط¯ظپظˆط¹: ${cad(customer.totalPaid)}
ط§ظ„ط±طµظٹط¯ ط§ظ„ظ†ظ‡ط§ط¦ظٹ ط§ظ„ظ…طھط¨ظ‚ظٹ: ${cad(customer.finalBalance)}
ط´ظƒط±ط§ظ‹ ظ„طھط¹ط§ظ…ظ„ظƒظ… ظ…ط¹ ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ظ„ظ„طھط¬ط§ط±ط©.`;

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,"_blank");
  }

  const filtered=list.filter(customer=>
    `${customer.name} ${customer.phone||""}`.toLowerCase().includes(search.toLowerCase())
  );

  return <>
    <h2>ظ‚ط§ط¦ظ…ط© ط§ظ„ط¹ظ…ظ„ط§ط،</h2>
    {error&&<div className="card customer-error">{error}</div>}

    <div className="stats">
      <div className="card"><span>ط¹ط¯ط¯ ط§ظ„ط¹ظ…ظ„ط§ط،</span><strong>{list.length}</strong></div>
      <div className="card"><span>ظ…ط¬ظ…ظˆط¹ ط§ظ„ط­ط³ط§ط¨ط§طھ ط§ظ„ظƒظ„ظٹ</span><strong>{cad(list.reduce((sum,item)=>sum+Number(item.totalTransactions||0),0))}</strong></div>
      <div className="card"><span>ظ…ط¬ظ…ظˆط¹ ط§ظ„ظ…ط¯ظپظˆط¹</span><strong>{cad(list.reduce((sum,item)=>sum+Number(item.totalPaid||0),0))}</strong></div>
      <div className="card final"><span>ط§ظ„ظ…ط¬ظ…ظˆط¹ ط§ظ„ظ†ظ‡ط§ط¦ظٹ (CAD) ط§ظ„ظ…طھط¨ظ‚ظٹ</span><strong>{cad(list.reduce((sum,item)=>sum+Number(item.finalBalance||0),0))}</strong></div>
      <div className="card overdue-card"><span>ط§ظ„ظ…طھط£ط®ط±ظˆظ† ط£ظƒط«ط± ظ…ظ† ط£ط³ط¨ظˆط¹</span><strong>{alerts.count}</strong></div>
    </div>

    <div className="customer-toolbar card">
      <button onClick={()=>{setActivePanel("newCustomer");setEditingCustomer(null)}}>ط¥ط¶ط§ظپط© ط¹ظ…ظٹظ„</button>
      <button onClick={()=>setActivePanel(activePanel==="transfer"?"":"transfer")}>ط¥ط¶ط§ظپط© ط­ظˆط§ظ„ط©</button>
      <button onClick={()=>setActivePanel(activePanel==="payment"?"":"payment")}>ط¥ط¶ط§ظپط© ط¯ظپط¹ط©</button>
    </div>

    {activePanel==="newCustomer"&&
      <form className="card form edit-panel" onSubmit={addCustomer}>
        <h3>ط¥ط¶ط§ظپط© ط¹ظ…ظٹظ„ ط¬ط¯ظٹط¯</h3>
        <input value={customerForm.name} onChange={e=>setCustomerForm({...customerForm,name:e.target.value})} placeholder="ط§ط³ظ… ط§ظ„ط¹ظ…ظٹظ„" required/>
        <input value={customerForm.phone} onChange={e=>setCustomerForm({...customerForm,phone:e.target.value})} placeholder="ط±ظ‚ظ… ط§ظ„ظ‡ط§طھظپ / ظˆط§طھط³ط§ط¨"/>
        <input type="email" value={customerForm.email} onChange={e=>setCustomerForm({...customerForm,email:e.target.value})} placeholder="ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ"/>
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
        <button>ط­ظپط¸ ط§ظ„طھط¹ط¯ظٹظ„</button>
        <button type="button" onClick={()=>setEditingCustomer(null)}>ط¥ظ„ط؛ط§ط،</button>
      </form>
    }

    {activePanel==="transfer"&&
      <form className="card form edit-panel" onSubmit={addTransfer}>
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
        <button>ط­ظپط¸ ط§ظ„ط­ظˆط§ظ„ط©</button>
        <button type="button" onClick={()=>setActivePanel("")}>ط¥ظ„ط؛ط§ط،</button>
      </form>
    }

    {activePanel==="payment"&&
      <form className="card form edit-panel" onSubmit={addPayment}>
        <h3>ط¥ط¶ط§ظپط© ط¯ظپط¹ط©</h3>
        <select value={paymentForm.customerId} onChange={async e=>{
          const customer=list.find(item=>item.id===e.target.value);
          if(customer)await preparePayment(customer);
        }} required>
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
    }

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

    <div className="customer-cards">
      {filtered.length?filtered.map(customer=><article className={`customer-account-card ${customer.overdue?"is-overdue":customer.finalBalance>0?"has-balance":"is-paid"}`} key={customer.id}>
        <div className="customer-card-header">
          <div>
            <h3>{customer.name}</h3>
            <p>{customer.phone||"ظ„ط§ ظٹظˆط¬ط¯ ط±ظ‚ظ… ظ‡ط§طھظپ"}</p>
          </div>
          <span className="customer-status">
            {customer.overdue?"ظ…طھط£ط®ط±":customer.finalBalance>0?"ظ…ط³طھط­ظ‚":"ظ…ط³ط¯ط¯"}
          </span>
        </div>

        <div className="customer-totals">
          <div><span>ظ…ط¬ظ…ظˆط¹ ط§ظ„ط­ط³ط§ط¨</span><strong>{cad(customer.totalTransactions)}</strong></div>
          <div><span>ط§ظ„ظ…ط¯ظپظˆط¹</span><strong>{cad(customer.totalPaid)}</strong></div>
          <div className="final-balance"><span>ط§ظ„ظ…ط¬ظ…ظˆط¹ ط§ظ„ظ†ظ‡ط§ط¦ظٹ (CAD)</span><strong>{cad(customer.finalBalance)}</strong></div>
        </div>

        {customer.overdue&&<p className="overdue-text">ظ…طھط£ط®ط± {customer.overdueDays} ظٹظˆظ… ظ…ظ† ط£ظ‚ط¯ظ… ط­ظˆط§ظ„ط© ط؛ظٹط± ظ…ط¯ظپظˆط¹ط©.</p>}

        <div className="customer-card-actions">
          <button onClick={()=>open(customer.id)}>ظپطھط­ ط§ظ„ط­ط³ط§ط¨</button>
          <button onClick={()=>prepareTransfer(customer)}>ط¥ط¶ط§ظپط© ط­ظˆط§ظ„ط©</button>
          <button onClick={()=>preparePayment(customer)}>ط¥ط¶ط§ظپط© ط¯ظپط¹ط©</button>
          <button onClick={()=>{setEditingCustomer({...customer});setActivePanel("")}}>طھط¹ط¯ظٹظ„</button>
          <button className="whatsapp-button" onClick={()=>whatsappFinalBalance(customer,false)}>ظˆط§طھط³ط§ط¨ ط¨ط§ظ„ظ…ط¬ظ…ظˆط¹ ط§ظ„ظ†ظ‡ط§ط¦ظٹ (CAD)</button>
          {customer.overdue&&<button className="danger-button" onClick={()=>whatsappFinalBalance(customer,true)}>طھظ†ط¨ظٹظ‡ ط§ظ„ط¯ظپط¹</button>}
        </div>
      </article>):<div className="card">ظ„ط§ طھظˆط¬ط¯ ظ†طھط§ط¦ط¬.</div>}
    </div>
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
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(whatsappText(customer,type))}`,"_blank");
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
    transactionId:"",
    amount:"",
    paymentDate:new Date().toISOString().slice(0,10),
    method:"CASH",
    reference:"",
    notes:""
  });
  const [editingTransaction,setEditingTransaction]=useState(null);
  const [editingPayment,setEditingPayment]=useState(null);

  async function load(){
    setLoading(true);
    setError("");
    try{
      const response=await api.get(`/customers/${id}`);
      const result=response?.data||{};
      setData({
        customer:result.customer||{name:"ط¹ظ…ظٹظ„"},
        transactions:Array.isArray(result.transactions)?result.transactions:[],
        payments:Array.isArray(result.payments)?result.payments:[],
      });
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± طھط­ظ…ظٹظ„ ظ…ظ„ظپ ط§ظ„ط¹ظ…ظٹظ„");
      setData(null);
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{load();},[id]);

  async function addPayment(event){
    event.preventDefault();
    try{
      await api.post(`/transactions/${paymentForm.transactionId}/payments`,{
        amount:paymentForm.amount,
        paymentDate:paymentForm.paymentDate,
        method:paymentForm.method,
        reference:paymentForm.reference,
        notes:paymentForm.notes
      });
      setPaymentForm({
        transactionId:"",
        amount:"",
        paymentDate:new Date().toISOString().slice(0,10),
        method:"CASH",
        reference:"",
        notes:""
      });
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± ط­ظپط¸ ط§ظ„ط¯ظپط¹ط©");
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
    </div>

    <h2>{customer.name||"ط§ظ„ط¹ظ…ظٹظ„"}</h2>
    {error&&<div className="card customer-error">{error}</div>}

    <div className="stats">
      <div className="card"><span>ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط­ط³ط§ط¨</span><strong>{cad(customer.totalTransactions)}</strong></div>
      <div className="card"><span>ط§ظ„ظ…ط¯ظپظˆط¹</span><strong>{cad(customer.totalPaid)}</strong></div>
      <div className="card final"><span>ط§ظ„ط­ط³ط§ط¨ ط§ظ„ظ†ظ‡ط§ط¦ظٹ</span><strong>{cad(customer.finalBalance)}</strong></div>
    </div>

    {unpaidTransactions.length>0&&
      <form className="card form" onSubmit={addPayment}>
        <h3>ط¥ط¶ط§ظپط© ط¯ظپط¹ط©</h3>
        <select value={paymentForm.transactionId} onChange={e=>setPaymentForm({...paymentForm,transactionId:e.target.value})} required>
          <option value="">ط§ط®طھط± ط§ظ„ط­ظˆط§ظ„ط©</option>
          {unpaidTransactions.map(transaction=><option key={transaction.id} value={transaction.id}>
            {transaction.number} â€” ظ…طھط¨ظ‚ظٹ {money(transaction.remaining)}
          </option>)}
        </select>
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
            <button onClick={()=>setPaymentForm({...paymentForm,transactionId:transaction.id})}>ط¥ط¶ط§ظپط© ط¯ظپط¹ط©</button>
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
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,"_blank");
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

  function whatsappStatement(){
    if(!data)return;
    const phone=String(data.customer.phone||"").replace(/\D/g,"");
    if(!phone){
      setError("ظ„ط§ ظٹظˆط¬ط¯ ط±ظ‚ظ… ظˆط§طھط³ط§ط¨ ظ…ط­ظپظˆط¸ ظ„ظ„ط¹ظ…ظٹظ„");
      return;
    }

    const message=[
      `ط§ظ„ط³ظ„ط§ظ… ط¹ظ„ظٹظƒظ… ${data.customer.name}طŒ`,
      `ظƒط´ظپ ط­ط³ط§ط¨ظƒظ… ظ„ط¯ظ‰ ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ظ„ظ„طھط¬ط§ط±ط©:`,
      `ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط­ظˆط§ظ„ط§طھ: ${Number(data.totals.usdAmount).toFixed(2)} USD`,
      `ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ظ…ط¨ظ„ط؛ ط§ظ„ظ†ظ‡ط§ط¦ظٹ: ${money(data.totals.totalCad)} CAD`,
      `ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط¯ظپط¹ط§طھ: ${money(data.totals.paid)} CAD`,
      `ط§ظ„ط±طµظٹط¯ ط§ظ„ظ…طھط¨ظ‚ظٹ: ${money(data.totals.remaining)} CAD`,
      `ط´ظƒط±ط§ظ‹ ظ„طھط¹ط§ظ…ظ„ظƒظ… ظ…ط¹ظ†ط§.`
    ].join("\n");

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,"_blank");
  }

  const statusLabel={
    PAID:"ظ…ط³ط¯ط¯ط©",
    PARTIAL:"ظ…ط³ط¯ط¯ ط¬ط²ط¦ظٹط§ظ‹",
    UNPAID:"ط؛ظٹط± ظ…ط³ط¯ط¯ط©",
    OVERDUE:"ظ…طھط£ط®ط±ط©"
  };

  return <>
    <div className="card no-print statement-toolbar">
      <button onClick={back}>ط±ط¬ظˆط¹</button>
      <input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})}/>
      <input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})}/>
      <button onClick={load}>ط¹ط±ط¶ ظƒط´ظپ ط§ظ„ط­ط³ط§ط¨</button>
      <button onClick={()=>window.print()} disabled={!data}>ط·ط¨ط§ط¹ط© / ط­ظپط¸ PDF</button>
      <button className="whatsapp-button" onClick={whatsappStatement} disabled={!data}>ط¥ط±ط³ط§ظ„ ظˆط§طھط³ط§ط¨</button>
    </div>

    {error&&<div className="card customer-error">{error}</div>}

    {data&&<section className="invoice-sheet statement-sheet">
      <div className="invoice-header">
        <div>
          <h1>{data.company.name}</h1>
          <p>{data.company.nameEn}</p>
          <h3>ظƒط´ظپ ط­ط³ط§ط¨ ط§ظ„ط¹ظ…ظٹظ„</h3>
        </div>
        <div>
          <p><strong>طھط§ط±ظٹط® ط§ظ„ط¥طµط¯ط§ط±:</strong> {String(data.generatedAt).slice(0,10)}</p>
          <p><strong>ط§ظ„ظپطھط±ط©:</strong> {data.from||"ط§ظ„ط¨ط¯ط§ظٹط©"} ط¥ظ„ظ‰ {data.to||"ط§ظ„ظٹظˆظ…"}</p>
        </div>
      </div>

      <div className="statement-customer-header">
        <div>
          <h2>{data.customer.name}</h2>
          <p><strong>ط§ظ„ظ‡ط§طھظپ / ظˆط§طھط³ط§ط¨:</strong> {data.customer.phone||"-"}</p>
          <p><strong>ط§ظ„ط¨ط±ظٹط¯:</strong> {data.customer.email||"-"}</p>
          <p><strong>ط¢ط®ط± ط­ط±ظƒط©:</strong> {data.lastActivity||"-"}</p>
        </div>
        <div className="statement-balance">
          <span>ط§ظ„ط±طµظٹط¯ ط§ظ„ط­ط§ظ„ظٹ</span>
          <strong>{money(data.totals.remaining)} CAD</strong>
        </div>
      </div>

      <div className="statement-summary">
        <div><span>ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط­ظˆط§ظ„ط§طھ</span><strong>{Number(data.totals.usdAmount).toFixed(2)} USD</strong></div>
        <div><span>ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ظ…ط¨ظ„ط؛ ط§ظ„ظ†ظ‡ط§ط¦ظٹ</span><strong>{money(data.totals.totalCad)} CAD</strong></div>
        <div><span>ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط¯ظپط¹ط§طھ</span><strong>{money(data.totals.paid)} CAD</strong></div>
        <div className="remaining"><span>ط§ظ„ط±طµظٹط¯ ط§ظ„ظ…طھط¨ظ‚ظٹ</span><strong>{money(data.totals.remaining)} CAD</strong></div>
      </div>

      <div className="tablewrap">
        <table className="statement-table">
          <thead>
            <tr>
              <th>ط§ظ„طھط§ط±ظٹط®</th>
              <th>ط±ظ‚ظ… ط§ظ„ط­ظˆط§ظ„ط©</th>
              <th>ظ…ط¨ظ„ط؛ ط§ظ„ط­ظˆط§ظ„ط© (USD)</th>
              <th>طھظƒظ„ظپط© ط§ظ„ط­ظˆط§ظ„ط© (CAD)</th>
              <th>ط§ظ„ظ…ط¬ظ…ظˆط¹ ط§ظ„ظ†ظ‡ط§ط¦ظٹ (CAD) (CAD)</th>
              <th>ط§ظ„ط¯ظپط¹ط§طھ (CAD)</th>
              <th>ط§ظ„ظ…طھط¨ظ‚ظٹ (CAD)</th>
              <th>ط§ظ„ط­ط§ظ„ط©</th>
            </tr>
          </thead>
          <tbody>
            {data.transactions.length?
              data.transactions.map(item=><tr key={item.id} className={`statement-row status-${item.status.toLowerCase()}`}>
                <td>{item.transferDate}</td>
                <td>{item.number}</td>
                <td>{Number(item.usdAmount).toFixed(2)}</td>
                <td>{money(item.totalCad)}</td>
                <td>{money(item.paid)}</td>
                <td><strong>{money(item.remaining)}</strong></td>
                <td>
                  <span className={`statement-status ${item.status.toLowerCase()}`}>
                    {statusLabel[item.status]||item.status}
                  </span>
                  {item.status==="OVERDUE"&&<small>{item.overdueDays} ظٹظˆظ…</small>}
                </td>
              </tr>)
              :<tr><td colSpan="7">ظ„ط§ طھظˆط¬ط¯ ط­ظˆط§ظ„ط§طھ ظپظٹ ظ‡ط°ظ‡ ط§ظ„ظپطھط±ط©.</td></tr>
            }
          </tbody>
        </table>
      </div>

      <p className="invoice-note">ظ‡ط°ط§ ط§ظ„ظƒط´ظپ ظ„ط§ ظٹطھط¶ظ…ظ† ط£ظٹ ظ…ط¹ظ„ظˆظ…ط§طھ ط¯ط§ط®ظ„ظٹط© ط¹ظ† ط£ط±ط¨ط§ط­ ط§ظ„ط´ط±ظƒط©.</p>
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
        transferDate:new Date().toISOString().slice(0,10)
      }));
      await load();
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± ط­ظپط¸ ط§ظ„ط­ظˆط§ظ„ط©");
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
      <button>ط­ظپط¸</button>
    </form>

    <div className="card tablewrap">
      <table>
        <thead>
          <tr>
            <th>ط§ظ„ط±ظ‚ظ…</th><th>طھط§ط±ظٹط® ط§ظ„ط­ظˆط§ظ„ط©</th><th>ط§ظ„ط¹ظ…ظٹظ„</th><th>ط§ظ„ظ…ط¨ظ„ط؛</th>
            <th>ط§ظ„ط£ط¬ظˆط±</th><th>ط§ظ„ط¥ط¬ظ…ط§ظ„ظٹ</th><th>ط§ظ„ط±ط¨ط­</th><th>ط§ظ„ظپط§طھظˆط±ط©</th>
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
            <td>{money(transaction.totalProfit)}</td>
            <td><button onClick={()=>openInvoice(transaction.id)}>ظپطھط­</button></td>
          </tr>):<tr><td colSpan="7">ظ„ط§ طھظˆط¬ط¯ ط­ظˆط§ظ„ط§طھ.</td></tr>}
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
  const [refreshing,setRefreshing]=useState(false);
  const [message,setMessage]=useState("");

  function trendFor(rate){
    const pairHistory=history
      .filter(item=>item.baseCurrency===rate.baseCurrency&&item.quoteCurrency===rate.quoteCurrency)
      .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    const previous=pairHistory.find(item=>item.id!==rate.id);
    if(!previous)return {type:"new",symbol:"â—ڈ",label:"ط¬ط¯ظٹط¯",change:0};
    const currentValue=Number(rate.sellRate||rate.buyRate||0);
    const previousValue=Number(previous.sellRate||previous.buyRate||0);
    const change=currentValue-previousValue;
    if(change>0)return {type:"up",symbol:"â†‘",label:"ظ…ط±طھظپط¹",change};
    if(change<0)return {type:"down",symbol:"â†“",label:"ظ…ظ†ط®ظپط¶",change};
    return {type:"same",symbol:"â†’",label:"ط«ط§ط¨طھ",change:0};
  }
  const load=()=>Promise.all([api.get("/exchange-rates"),api.get("/exchange-rates/history")]).then(([a,b])=>{setList(a.data);setHistory(b.data)});
  useEffect(()=>{load();},[]);
  async function add(e){
    e.preventDefault();
    await api.post("/exchange-rates",f);
    setF(x=>({...x,buyRate:"",sellRate:"",notes:""}));
    load();
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
  return <>
    <h2>ط§ظ„ط¹ظ…ظ„ط§طھ ظˆط£ط³ط¹ط§ط± ط§ظ„طµط±ظپ</h2>
    <div className="card rate-legend">
      <span className="legend-up">â†‘ ط§ط±طھظپط§ط¹</span>
      <span className="legend-down">â†“ ط§ظ†ط®ظپط§ط¶</span>
      <span className="legend-same">â†’ ط«ط§ط¨طھ</span>
      <span className="legend-new">â—ڈ ط³ط¹ط± ط¬ط¯ظٹط¯</span>
    </div>
    <div className="card auto-rate-bar">
      <div>
        <strong>ط§ظ„طھط­ط¯ظٹط« ط§ظ„طھظ„ظ‚ط§ط¦ظٹ</strong>
        <p>ظٹطھظ… طھط­ط¯ظٹط« ط§ظ„ط£ط³ط¹ط§ط± ط¢ظ„ظٹظ‹ط§ ظƒظ„ 6 ط³ط§ط¹ط§طھ ظ…ظ† ظ…طµط¯ط± ط£ط³ط¹ط§ط± ط¨ظ†ظˆظƒ ظ…ط±ظƒط²ظٹط©.</p>
      </div>
      <button type="button" onClick={refresh} disabled={refreshing}>
        {refreshing?"ط¬ط§ط±ظٹ ط§ظ„طھط­ط¯ظٹط«...":"طھط­ط¯ظٹط« ط§ظ„ط£ط³ط¹ط§ط± ط§ظ„ط¢ظ†"}
      </button>
    </div>
    {message&&<div className="card rate-message">{message}</div>}
    <form className="card form" onSubmit={add}>
      <select value={f.baseCurrency} onChange={e=>setF({...f,baseCurrency:e.target.value})}>
        {["CAD","USD","EUR","SYP","AED","GBP"].map(x=><option key={x}>{x}</option>)}
      </select>
      <select value={f.quoteCurrency} onChange={e=>setF({...f,quoteCurrency:e.target.value})}>
        {["USD","CAD","EUR","SYP","AED","GBP"].map(x=><option key={x}>{x}</option>)}
      </select>
      <input type="number" step=".0001" value={f.buyRate} onChange={e=>setF({...f,buyRate:e.target.value})} placeholder="ط³ط¹ط± ط§ظ„ط´ط±ط§ط،" required/>
      <input type="number" step=".0001" value={f.sellRate} onChange={e=>setF({...f,sellRate:e.target.value})} placeholder="ط³ط¹ط± ط§ظ„ط¨ظٹط¹" required/>
      <input value={f.notes} onChange={e=>setF({...f,notes:e.target.value})} placeholder="ظ…ظ„ط§ط­ط¸ط§طھ"/>
      <button>ط­ظپط¸ ط§ظ„ط³ط¹ط±</button>
    </form>
    <div className="card tablewrap">
      <h3>ط¢ط®ط± ط§ظ„ط£ط³ط¹ط§ط±</h3>
      <table>
        <thead><tr><th>ظ…ظ†</th><th>ط¥ظ„ظ‰</th><th>ط´ط±ط§ط،</th><th>ط¨ظٹط¹</th><th>ط§ظ„ظ…طµط¯ط±</th><th>ط¢ط®ط± طھط­ط¯ظٹط«</th></tr></thead>
        <tbody>{list.map(r=>{
          const trend=trendFor(r);
          return <tr key={r.id} className={`rate-row rate-${trend.type}`}>
            <td><span className="currency-badge">{r.baseCurrency}</span></td>
            <td><span className="currency-badge">{r.quoteCurrency}</span></td>
            <td className="buy-rate">{Number(r.buyRate).toFixed(4)}</td>
            <td className={`sell-rate ${trend.type}`}>
              <strong>{Number(r.sellRate).toFixed(4)}</strong>
              <span className={`trend trend-${trend.type}`}>{trend.symbol} {trend.label}</span>
            </td>
            <td><span className={`source-badge ${r.source==="FRANKFURTER"?"auto":"manual"}`}>{r.source==="FRANKFURTER"?"طھظ„ظ‚ط§ط¦ظٹ":"ظٹط¯ظˆظٹ"}</span></td>
            <td>{new Date(r.createdAt).toLocaleString("ar-CA")}</td>
          </tr>
        })}</tbody>
      </table>
    </div>
    <div className="card tablewrap">
      <h3>ط³ط¬ظ„ طھط؛ظٹظٹط±ط§طھ ط§ظ„ط£ط³ط¹ط§ط±</h3>
      <table>
        <thead><tr><th>ط§ظ„طھط§ط±ظٹط®</th><th>ط§ظ„ط²ظˆط¬</th><th>ط´ط±ط§ط،</th><th>ط¨ظٹط¹</th><th>ط§ظ„ظ…طµط¯ط±</th><th>ظ…ظ„ط§ط­ط¸ط§طھ</th></tr></thead>
        <tbody>{history.map(r=><tr key={r.id}>
          <td>{new Date(r.createdAt).toLocaleString("ar-CA")}</td>
          <td>{r.baseCurrency}/{r.quoteCurrency}</td>
          <td>{Number(r.buyRate).toFixed(4)}</td>
          <td>{Number(r.sellRate).toFixed(4)}</td>
          <td>{r.source==="FRANKFURTER"?"طھظ„ظ‚ط§ط¦ظٹ":"ظٹط¯ظˆظٹ"}</td>
          <td>{r.notes||"-"}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}


function GeneralDebts(){
  const [data,setData]=useState({rows:[],totals:{receivable:0,payable:0,net:0}});
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
        totals:data?.totals||{receivable:0,payable:0,net:0}
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

  const openDebts=data.rows.filter(item=>Number(item.remaining||0)>0);

  const statusLabel={
    OPEN:"ظ…ظپطھظˆط­",
    PARTIAL:"ظ…ط¯ظپظˆط¹ ط¬ط²ط¦ظٹظ‹ط§",
    PAID:"ظ…ط¯ظپظˆط¹",
    OVERDUE:"ظ…طھط£ط®ط±"
  };

  return <>
    <h2>ط§ظ„ط¯ظ‘ظژظٹظ† ط§ظ„ط¹ط§ظ…</h2>

    <div className="stats">
      <div className="card receivable-card">
        <span>ط¯ظٹظ† ظ„ظ†ط§</span>
        <strong>{money(data.totals.receivable)}</strong>
      </div>
      <div className="card payable-card">
        <span>ط¯ظٹظ† ط¹ظ„ظٹظ†ط§</span>
        <strong>{money(data.totals.payable)}</strong>
      </div>
      <div className="card final">
        <span>طµط§ظپظٹ ط§ظ„ط¯ظٹظˆظ†</span>
        <strong>{money(data.totals.net)}</strong>
      </div>
    </div>

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
        {["CAD","USD","EUR","SYP","AED","GBP"].map(currency=>
          <option key={currency}>{currency}</option>
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
              </tr>
            )
            :<tr><td colSpan="9">ظ„ط§ طھظˆط¬ط¯ ط¯ظٹظˆظ† ظ…ط³ط¬ظ„ط©.</td></tr>
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
        {["CAD","USD","EUR","SYP","AED","GBP"].map(currency=><option key={currency}>{currency}</option>)}
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
        {["CAD","USD","EUR","SYP","AED","GBP"].map(currency=><option key={currency}>{currency}</option>)}
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
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,"_blank");
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
    <h2>ط§ظ„ظ…ظˆط±ط¯ظˆظ† ظˆط§ظ„ط´ط±ظƒط§طھ</h2>
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
  const [error,setError]=useState("");

  async function load(){
    setError("");
    try{
      const response=await api.get("/capital-overview",{params:{month}});
      setData(response.data);
    }catch(requestError){
      setError(requestError.response?.data?.message||"طھط¹ط°ط± طھط­ظ…ظٹظ„ ط±ط£ط³ ط§ظ„ظ…ط§ظ„");
    }
  }

  useEffect(()=>{load();},[month]);

  if(!data)return <><h2>ط±ط£ط³ ط§ظ„ظ…ط§ظ„ ط§ظ„ظƒظ„ظٹ</h2>{error?<div className="card customer-error">{error}</div>:<p>ط¬ط§ط±ظٹ ط§ظ„طھط­ظ…ظٹظ„...</p>}</>;

  const efficiency=data.turnoverRate>=3?"ظ…ظ…طھط§ط²":data.turnoverRate>=2?"ط¬ظٹط¯ ط¬ط¯ط§ظ‹":data.turnoverRate>=1?"ط¬ظٹط¯":"ظ…ظ†ط®ظپط¶";

  return <>
    <div className="page-title-row">
      <h2>ط±ط£ط³ ط§ظ„ظ…ط§ظ„ ط§ظ„ظƒظ„ظٹ ظˆط­ط±ظƒط© ط¯ظˆط±ط§ظ†ظ‡</h2>
      <button className="no-print" onClick={()=>window.print()}>ط·ط¨ط§ط¹ط© ط§ظ„طھظ‚ط±ظٹط±</button>
    </div>

    <div className="card form no-print">
      <label>ط§ط®طھظٹط§ط± ط§ظ„ط´ظ‡ط±</label>
      <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/>
      <button onClick={load}>طھط­ط¯ظٹط«</button>
    </div>

    {error&&<div className="card customer-error">{error}</div>}

    <div className="stats">
      <div className="card final">
        <span>ط±ط£ط³ ط§ظ„ظ…ط§ظ„ ط§ظ„ظƒظ„ظٹ ط§ظ„طھظ‚ط¯ظٹط±ظٹ</span>
        <strong>{money(data.totalCapital)}</strong>
      </div>
      <div className="card">
        <span>طµط§ظپظٹ ط­ط±ظƒط© ط±ط£ط³ ط§ظ„ظ…ط§ظ„</span>
        <strong>{money(data.capitalBalance)}</strong>
      </div>
      <div className="card transfer-total-card">
        <span>ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط­ظˆط§ظ„ط§طھ ظپظٹ ط§ظ„ط´ظ‡ط±</span>
        <strong>{money(data.monthlyTransferValue)}</strong>
      </div>
      <div className="card turnover-card">
        <span>ظ…ط¹ط¯ظ„ ط¯ظˆط±ط§ظ† ط±ط£ط³ ط§ظ„ظ…ط§ظ„</span>
        <strong>{Number(data.turnoverRate).toFixed(2)} ظ…ط±ط©</strong>
        <small>{efficiency}</small>
      </div>
    </div>

    <div className="stats">
      <div className="card"><span>ط¹ط¯ط¯ ط§ظ„ط­ظˆط§ظ„ط§طھ ط§ظ„ط´ظ‡ط±ظٹط©</span><strong>{data.monthlyTransferCount}</strong></div>
      <div className="card"><span>ظ…طھظˆط³ط· ظ‚ظٹظ…ط© ط§ظ„ط­ظˆط§ظ„ط©</span><strong>{money(data.averageTransfer)}</strong></div>
      <div className="card"><span>ط£ط±ط¨ط§ط­ ط§ظ„ط´ظ‡ط±</span><strong>{money(data.monthlyProfit)}</strong></div>
      <div className="card"><span>ظ…طµط±ظˆظپط§طھ ط§ظ„ط´ظ‡ط±</span><strong>{money(data.monthlyExpenses)}</strong></div>
      <div className="card receivable-card"><span>ط°ظ…ظ… ط§ظ„ط¹ظ…ظ„ط§ط،</span><strong>{money(data.receivables)}</strong></div>
      <div className="card receivable-card"><span>ط¯ظٹظ† ظ„ظ†ط§</span><strong>{money(data.generalReceivable)}</strong></div>
      <div className="card payable-card"><span>ط¯ظٹظ† ط¹ظ„ظٹظ†ط§</span><strong>{money(data.generalPayable)}</strong></div>
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

function NotificationSettings(){
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

  return <>
    <h2>ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„طھظ†ط¨ظٹظ‡ط§طھ ظˆظˆط§طھط³ط§ط¨</h2>
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
    <div className="card">
      <strong>ظ…ظ„ط§ط­ط¸ط©:</strong>
      <p>ط²ط± ظˆط§طھط³ط§ط¨ ظٹظپطھط­ ط§ظ„ط±ط³ط§ظ„ط© ط¬ط§ظ‡ط²ط© ظ„ظ„ط¥ط±ط³ط§ظ„. ط§ظ„ط¥ط±ط³ط§ظ„ ط§ظ„طھظ„ظ‚ط§ط¦ظٹ ط¯ظˆظ† ط¶ط؛ط· ظٹط­طھط§ط¬ ط±ط¨ط· WhatsApp Business API ط±ط³ظ…ظٹ.</p>
    </div>
  </>;
}




function ArchivedCustomers({navigate}){
  const [rows,setRows]=useState([]);
  const [message,setMessage]=useState("");
  const [busyId,setBusyId]=useState("");

  const load=()=>api.get("/customers-archived")
    .then(response=>setRows(response.data||[]))
    .catch(error=>setMessage(error.response?.data?.message||"طھط¹ط°ط± طھط­ظ…ظٹظ„ ط§ظ„ط¹ظ…ظ„ط§ط، ط§ظ„ظ…ط¤ط±ط´ظپظٹظ†"));

  useEffect(load,[]);

  const restore=async(customer)=>{
    if(!window.confirm(`ظ‡ظ„ طھط±ظٹط¯ ط§ط³طھط¹ط§ط¯ط© ط§ظ„ط¹ظ…ظٹظ„ ${customer.name}طں`))return;
    setBusyId(customer.id);
    setMessage("");
    try{
      await api.post(`/customers/${customer.id}/restore`);
      setMessage("طھظ…طھ ط§ط³طھط¹ط§ط¯ط© ط§ظ„ط¹ظ…ظٹظ„ ط¨ظ†ط¬ط§ط­.");
      load();
    }catch(error){
      setMessage(error.response?.data?.message||"طھط¹ط°ط± ط§ط³طھط¹ط§ط¯ط© ط§ظ„ط¹ظ…ظٹظ„");
    }finally{
      setBusyId("");
    }
  };

  return <div className="archived-customers-page">
    <div className="page-title-row">
      <div><h2>ًں“¦ ط§ظ„ط¹ظ…ظ„ط§ط، ط§ظ„ظ…ط¤ط±ط´ظپظˆظ†</h2><p>ظٹظ…ظƒظ† ط§ط³طھط¹ط§ط¯ط© ط£ظٹ ط¹ظ…ظٹظ„ ط¥ظ„ظ‰ ط§ظ„ظ‚ط§ط¦ظ…ط© ط§ظ„ط±ط¦ظٹط³ظٹط©.</p></div>
      <button onClick={()=>navigate("customers")}>ط§ظ„ط¹ظˆط¯ط© ط¥ظ„ظ‰ ط§ظ„ط¹ظ…ظ„ط§ط،</button>
    </div>

    {message&&<p className="success-note">{message}</p>}

    <div className="archived-grid">
      {rows.length?rows.map(customer=><article className="archived-customer-card" key={customer.id}>
        <div className="archived-customer-head">
          <div className="customer-avatar">{String(customer.name||"?").slice(0,1)}</div>
          <div>
            <strong>{customer.name}</strong>
            <small>{customer.phone||"ط¨ط¯ظˆظ† ط±ظ‚ظ… ظ‡ط§طھظپ"}</small>
          </div>
        </div>
        <div className="archived-meta">
          <span>طھط§ط±ظٹط® ط§ظ„ط£ط±ط´ظپط©</span>
          <strong>{customer.archivedAt?new Date(customer.archivedAt).toLocaleString("ar-CA"):"â€”"}</strong>
        </div>
        <button disabled={busyId===customer.id} onClick={()=>restore(customer)}>
          {busyId===customer.id?"ط¬ط§ط±ظٹ ط§ظ„ط§ط³طھط¹ط§ط¯ط©â€¦":"â†© ط§ط³طھط¹ط§ط¯ط© ط§ظ„ط¹ظ…ظٹظ„"}
        </button>
      </article>):<div className="empty-state">ظ„ط§ ظٹظˆط¬ط¯ ط¹ظ…ظ„ط§ط، ظ…ط¤ط±ط´ظپظˆظ†.</div>}
    </div>
  </div>;
}


function DataSafety(){
  const [status,setStatus]=useState(null);
  const [backups,setBackups]=useState([]);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  const load=()=>{
    Promise.all([api.get("/storage-status"),api.get("/backups")])
      .then(([statusResponse,backupResponse])=>{
        setStatus(statusResponse.data);
        setBackups(backupResponse.data||[]);
      })
      .catch(error=>setMessage(error.response?.data?.message||"طھط¹ط°ط± طھط­ظ…ظٹظ„ ط­ط§ظ„ط© ط§ظ„ط­ظپط¸"));
  };

  useEffect(load,[]);

  const create=async()=>{
    setBusy(true);setMessage("");
    try{
      await api.post("/backups");
      setMessage("طھظ… ط¥ظ†ط´ط§ط، ظ†ط³ط®ط© ط§ط­طھظٹط§ط·ظٹط© ط¬ط¯ظٹط¯ط©.");
      load();
    }catch(error){
      setMessage(error.response?.data?.message||"طھط¹ط°ط± ط¥ظ†ط´ط§ط، ط§ظ„ظ†ط³ط®ط© ط§ظ„ط§ط­طھظٹط§ط·ظٹط©");
    }finally{setBusy(false);}
  };

  const restore=async(filename)=>{
    if(!window.confirm("ط³ظٹطھظ… ط­ظپط¸ ظ†ط³ط®ط© ظ…ظ† ط§ظ„ظˆط¶ط¹ ط§ظ„ط­ط§ظ„ظٹ ط«ظ… ط§ط³طھط¹ط§ط¯ط© ط§ظ„ظ†ط³ط®ط© ط§ظ„ظ…ط­ط¯ط¯ط©. ظ‡ظ„ طھط±ظٹط¯ ط§ظ„ظ…طھط§ط¨ط¹ط©طں"))return;
    setBusy(true);setMessage("");
    try{
      await api.post(`/backups/${encodeURIComponent(filename)}/restore`);
      setMessage("طھظ…طھ ط§ط³طھط¹ط§ط¯ط© ط§ظ„ط¨ظٹط§ظ†ط§طھ ط¨ظ†ط¬ط§ط­. ط£ط¹ط¯ ظپطھط­ ط§ظ„طµظپط­ط©.");
      load();
    }catch(error){
      setMessage(error.response?.data?.message||"طھط¹ط°ط± ط§ط³طھط¹ط§ط¯ط© ط§ظ„ظ†ط³ط®ط©");
    }finally{setBusy(false);}
  };

  const downloadExport=async()=>{
    setBusy(true);setMessage("");
    try{
      const response=await api.get("/data-export",{responseType:"blob"});
      const url=URL.createObjectURL(response.data);
      const anchor=document.createElement("a");
      anchor.href=url;
      anchor.download=`alaboud-data-${new Date().toISOString().slice(0,10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    }catch(error){
      setMessage("طھط¹ط°ط± طھظ†ط²ظٹظ„ ظ†ط³ط®ط© ط§ظ„ط¨ظٹط§ظ†ط§طھ.");
    }finally{setBusy(false);}
  };

  return <div className="data-safety-page">
    <h2>ًں›،ï¸ڈ ط­ظ…ط§ظٹط© ط§ظ„ط¨ظٹط§ظ†ط§طھ ظˆط§ظ„ظ†ط³ط® ط§ظ„ط§ط­طھظٹط§ط·ظٹ</h2>

    <section className={`storage-status ${status?.persistentConfigured?"safe":"warning"}`}>
      <strong>{status?.persistentConfigured?"ط§ظ„طھط®ط²ظٹظ† ط§ظ„ط¯ط§ط¦ظ… ظ…ظپط¹ظ‘ظ„":"طھظ†ط¨ظٹظ‡: ط§ظ„طھط®ط²ظٹظ† ط§ظ„ط¯ط§ط¦ظ… ط؛ظٹط± ظ…ط¶ط¨ظˆط·"}</strong>
      <p>{status?.recommendation||"ط¬ط§ط±ظٹ ط§ظ„طھط­ظ‚ظ‚â€¦"}</p>
      {status?.dataDir&&<small>ظ…ط³ط§ط± ط§ظ„ط¨ظٹط§ظ†ط§طھ: {status.dataDir}</small>}
    </section>

    {message&&<p className="success-note">{message}</p>}

    <section className="backup-actions">
      <button disabled={busy} onClick={create}>ًں’¾ ط¥ظ†ط´ط§ط، ظ†ط³ط®ط© ط§ظ„ط¢ظ†</button>
      <button disabled={busy} onClick={downloadExport}>â¬‡ï¸ڈ طھظ†ط²ظٹظ„ ط¬ظ…ظٹط¹ ط§ظ„ط¨ظٹط§ظ†ط§طھ</button>
    </section>

    <section className="backup-list panel">
      <div className="section-heading"><h3>ط§ظ„ظ†ط³ط® ط§ظ„ظ…ط­ظپظˆط¸ط©</h3><span>{backups.length}</span></div>
      {backups.length?backups.map(item=><div className="backup-row" key={item.filename}>
        <div>
          <strong>{new Date(item.createdAt).toLocaleString("ar-CA")}</strong>
          <small>{(item.size/1024).toFixed(1)} KB</small>
        </div>
        <div>
          <a href={`${api.defaults.baseURL}/backups/${encodeURIComponent(item.filename)}/download`} target="_blank" rel="noreferrer">طھظ†ط²ظٹظ„</a>
          <button disabled={busy} onClick={()=>restore(item.filename)}>ط§ط³طھط¹ط§ط¯ط©</button>
        </div>
      </div>):<p>ظ„ط§ طھظˆط¬ط¯ ظ†ط³ط® ط§ط­طھظٹط§ط·ظٹط© ط­طھظ‰ ط§ظ„ط¢ظ†.</p>}
    </section>

    <section className="data-protection-note panel">
      <h3>ظƒظٹظپ طھط¨ظ‚ظ‰ ط§ظ„ط¨ظٹط§ظ†ط§طھ ط¨ط¹ط¯ ط§ظ„طھط­ط¯ظٹط«طں</h3>
      <p>ظ…ظ„ظپط§طھ ط§ظ„ظˆط§ط¬ظ‡ط© ظˆط§ظ„طھط·ط¨ظٹظ‚ ظ…ظ†ظپطµظ„ط© ط¹ظ† ظ…ط¬ظ„ط¯ ط§ظ„ط¨ظٹط§ظ†ط§طھ. طھط­ط¯ظٹط« GitHub ط£ظˆ Render ظ„ط§ ظٹط³طھط¨ط¯ظ„ ظ‚ط§ط¹ط¯ط© ط§ظ„ط¨ظٹط§ظ†ط§طھ ط¹ظ†ط¯ظ…ط§ ظٹظƒظˆظ† DATA_DIR ط¹ظ„ظ‰ ظ‚ط±طµ ط¯ط§ط¦ظ….</p>
      <p>طھط­ط¯ظٹط« APK ظ„ط§ ظٹط­ط°ظپ ط§ظ„ط¨ظٹط§ظ†ط§طھ ظ„ط£ظ†ظ‡ط§ ظ…ط­ظپظˆط¸ط© ط¹ظ„ظ‰ ط§ظ„ط®ط§ط¯ظ…طŒ ظˆظ„ظٹط³ ط¯ط§ط®ظ„ ط§ظ„طھط·ط¨ظٹظ‚.</p>
    </section>
  </div>;
}


function MorePage({navigate,onLogout}){
  const items=[
    ["rates","ًں’±","ط§ظ„ط¹ظ…ظ„ط§طھ ظˆط£ط³ط¹ط§ط± ط§ظ„طµط±ظپ","ط¥ط¯ط§ط±ط© CAD ظˆUSD ظˆEUR ظˆSYP ظˆط§ظ„ط¹ظ…ظ„ط§طھ ط§ظ„ط£ط®ط±ظ‰"],
    ["capital-overview","ًں’°","ط±ط£ط³ ط§ظ„ظ…ط§ظ„ ط§ظ„ظƒظ„ظٹ","ظ…ط±ط§ط¬ط¹ط© ط±ط£ط³ ط§ظ„ظ…ط§ظ„ ظˆط§ظ„ط­ط±ظƒط© ط§ظ„ظ…ط§ظ„ظٹط©"],
    ["debts","ًں“’","ط§ظ„ط¯ظ‘ظژظٹظ† ط§ظ„ط¹ط§ظ…","ط¹ط±ط¶ ط§ظ„ط°ظ…ظ… ظˆط§ظ„ط¯ظٹظˆظ† ط§ظ„ط¹ط§ظ…ط©"],
    ["notification-settings","ًں””","ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„طھظ†ط¨ظٹظ‡ط§طھ","ط§ظ„طھط­ظƒظ… ط¨ط§ظ„طھظ†ط¨ظٹظ‡ط§طھ ظˆط§ظ„ط¥ط´ط¹ط§ط±ط§طھ"],
    ["data-safety","ًں›،ï¸ڈ","ط­ظ…ط§ظٹط© ط§ظ„ط¨ظٹط§ظ†ط§طھ","ط§ظ„ظ†ط³ط® ط§ظ„ط§ط­طھظٹط§ط·ظٹ ظˆط§ظ„ط§ط³طھط¹ط§ط¯ط© ط§ظ„ط¢ظ…ظ†ط©"],
    ["archived-customers","ًں“¦","ط§ظ„ط¹ظ…ظ„ط§ط، ط§ظ„ظ…ط¤ط±ط´ظپظˆظ†","ط§ط³طھط¹ط§ط¯ط© ط§ظ„ط¹ظ…ظ„ط§ط، ط§ظ„ظ…ط¤ط±ط´ظپظٹظ†"],
    ["monthly-report","ًں“ٹ","ط§ظ„طھظ‚ط§ط±ظٹط± ط§ظ„ط´ظ‡ط±ظٹط©","ظ…ظ„ط®طµط§طھ ظˆطھظ‚ط§ط±ظٹط± ط§ظ„ط¹ظ…ظ„"],
  ];

  return <div className="enterprise-more-page">
    <section className="compact-company-card">
      <img src="/alaboud-company-logo.webp" alt="ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ط§ظ„طھط¬ط§ط±ظٹط©"/>
      <div><h2>ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ط§ظ„طھط¬ط§ط±ظٹط©</h2><p>v15.1 Customer Management</p></div>
      <span>â—ڈ ظ…طھطµظ„</span>
    </section>

    <section className="more-grid">
      {items.map(([key,icon,title,description])=><button key={key} onClick={()=>navigate(key)}>
        <span>{icon}</span>
        <div><strong>{title}</strong><small>{description}</small></div>
        <b>â€¹</b>
      </button>)}
    </section>

    <section className="support-card" onClick={()=>window.open("mailto:support@alaboud.local","_self")}>
      <span>ًںژ§</span>
      <div><strong>ط§ظ„ط¯ط¹ظ… ظˆط§ظ„ظ…ط³ط§ط¹ط¯ط©</strong><small>طھظˆط§طµظ„ ظ…ط¹ظ†ط§ ط¹ظ†ط¯ ط§ظ„ط­ط§ط¬ط© ط¥ظ„ظ‰ ظ…ط³ط§ط¹ط¯ط©</small></div>
      <b>â€¹</b>
    </section>

    <button className="final-logout-button" onClick={onLogout}>
      <span>â‡¥</span>
      <strong>طھط³ط¬ظٹظ„ ط§ظ„ط®ط±ظˆط¬</strong>
    </button>
  </div>;
}

function Simple({type}){const[list,setList]=useState([]),[title,setTitle]=useState(""),[amount,setAmount]=useState(""),[move,setMove]=useState("IN");const endpoint=type==="expenses"?"/expenses":"/capital";const load=()=>api.get(endpoint).then(r=>setList(r.data));useEffect(()=>{load();},[type]);async function add(e){e.preventDefault();await api.post(endpoint,type==="expenses"?{title,amount}:{type:move,amount,description:title});setTitle("");setAmount("");load();}return <><h2>{type==="expenses"?"ط§ظ„ظ…طµط±ظˆظپط§طھ":"ط±ط£ط³ ط§ظ„ظ…ط§ظ„"}</h2><form className="card form" onSubmit={add}>{type==="capital"&&<select value={move} onChange={e=>setMove(e.target.value)}><option value="IN">ط²ظٹط§ط¯ط©</option><option value="OUT">ط³ط­ط¨</option></select>}<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="ط§ظ„ظˆطµظپ" required/><input type="number" step=".01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="ط§ظ„ظ…ط¨ظ„ط؛" required/><button>ط­ظپط¸</button></form><div className="card tablewrap"><table><tbody>{list.map(x=><tr key={x.id}><td>{x.date}</td><td>{x.title||x.description}</td><td>{x.type||x.category}</td><td>{money(x.amount)}</td></tr>)}</tbody></table></div></>}
export default function App(){
  const [token,setToken]=useState(localStorage.getItem("afs_token"));
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
    content=<OverdueCustomers openCustomer={setCustomerId} onStatement={setStatementCustomerId} navigateCustomers={()=>navigate("customers")}/>;
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
  }else if(page==="capital-overview"){
    content=<CapitalOverview/>;
  }else if(page==="monthly-report"){
    content=<MonthlyReport/>;
  }else if(page==="notification-settings"){
    content=<NotificationSettings/>;
  }else if(page==="expenses"){
    content=<Simple type="expenses"/>;
  }else if(page==="archived-customers"){
    content=<ArchivedCustomers navigate={navigate}/>;
  }else if(page==="data-safety"){
    content=<DataSafety/>;
  }else if(page==="more"){
    content=<MorePage navigate={navigate} onLogout={()=>setLogoutConfirm(true)}/>;
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
    ["customers","ًں‘¥ ط§ظ„ط¹ظ…ظ„ط§ط،"],
    ["overdue-customers",`âڈ° ط§ظ„ط¹ظ…ظ„ط§ط، ط§ظ„ظ…طھط£ط®ط±ظˆظ†${overdueCount?` (${overdueCount})`:""}`],
    ["partners","ًںڈ¢ ط§ظ„ظ…ظˆط±ط¯ظˆظ† ظˆط§ظ„ط´ط±ظƒط§طھ"],
    ["transactions","â‡„ ط§ظ„ط­ظˆط§ظ„ط§طھ"],
    ["profits","ًں“ˆ ط§ظ„ط£ط±ط¨ط§ط­"],
    ["rates","ًں’± ط§ظ„ط¹ظ…ظ„ط§طھ ظˆط£ط³ط¹ط§ط± ط§ظ„طµط±ظپ"],
    ["debts","ًں“’ ط§ظ„ط¯ظ‘ظژظٹظ† ط§ظ„ط¹ط§ظ…"],
    ["capital-overview","ًں’° ط±ط£ط³ ط§ظ„ظ…ط§ظ„ ط§ظ„ظƒظ„ظٹ"],
    ["monthly-report","ًں“ٹ ط§ظ„طھظ‚ط§ط±ظٹط± ط§ظ„ط´ظ‡ط±ظٹط©"],
    ["notification-settings","ًں”” ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„طھظ†ط¨ظٹظ‡ط§طھ"],
    ["expenses","ًں§¾ ط§ظ„ظ…طµط±ظˆظپط§طھ"],
    ["capital","ًںڈ¦ ط­ط±ظƒط© ط±ط£ط³ ط§ظ„ظ…ط§ظ„"],
    ["more","â€¢â€¢â€¢ ط§ظ„ظ…ط²ظٹط¯"]
  ];

  return <div className={`app ${mobileMenuOpen?"mobile-menu-view":"mobile-page-view"}`}>
    <div className="mobile-page-header no-print">
      <button className="mobile-header-action mobile-menu-action" onClick={()=>setMobileMenuOpen(true)} aria-label="ظپطھط­ ط§ظ„ظ‚ط§ط¦ظ…ط©">
        <span className="mobile-header-icon">âک°</span><span>ط§ظ„ظ‚ط§ط¦ظ…ط©</span>
      </button>
      <div className="mobile-brand-center"><img className="mobile-header-logo" src="/alaboud-company-logo.webp" alt="ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ط§ظ„طھط¬ط§ط±ظٹط©"/><small>v15.3.5 Final</small></div>
      <button className="mobile-header-action mobile-home-action" onClick={()=>setMobileMenuOpen(true)} aria-label="ط§ظ„ظ‚ط§ط¦ظ…ط© ط§ظ„ط±ط¦ظٹط³ظٹط©">
        <span className="mobile-header-icon">âŒ‚</span><span>ط§ظ„ط±ط¦ظٹط³ظٹط©</span>
      </button>
    </div>
    <aside>
      <div className="mobile-menu-heading no-print">
        <img className="alaboud-sidebar-logo mobile-logo" src="/alaboud-company-logo.webp" alt="ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ط§ظ„طھط¬ط§ط±ظٹط©" />
        <button onClick={()=>setMobileMenuOpen(false)}>âœ•</button>
      </div>
      <div className="sidebar-logo-wrap"><img className="alaboud-sidebar-logo" src="/alaboud-company-logo.webp" alt="ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ط§ظ„طھط¬ط§ط±ظٹط©" /></div>
      <div className="sidebar-account-box no-print">
        <img src="/alaboud-company-logo.webp" alt="ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ط§ظ„طھط¬ط§ط±ظٹط©"/>
        <div>
          <strong>ط´ط±ظƒط© ط§ظ„ط¹ط¨ظˆط¯ ط§ظ„طھط¬ط§ط±ظٹط©</strong>
          <small>v15.1 Customer Management</small>
        </div>
        <span className="sidebar-online">â—ڈ ظ…طھطµظ„</span>
      </div>
      {menu.map(([key,label])=><button
        key={key}
        className={page===key&&!customerId&&!invoiceId&&!statementCustomerId&&!partnerId?"active":""}
        onClick={()=>navigate(key)}
      >{label}</button>)}
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
      {showHomeButton&&<div className="home-return-bar no-print">
        <button className="home-return-button" onClick={()=>{
          if(typeof window!=="undefined"&&window.matchMedia("(max-width: 800px)").matches){
            setMobileMenuOpen(true);
          }else{
            navigate("dashboard");
          }
        }}>
          â¬… ط§ظ„ط¹ظˆط¯ط© ط¥ظ„ظ‰ ط§ظ„ظ‚ط§ط¦ظ…ط© ط§ظ„ط±ط¦ظٹط³ظٹط©
        </button>
      </div>}
      <AppErrorBoundary key={`${page}-${customerId}-${invoiceId}-${statementCustomerId}-${partnerId}`}>
        {content}
      </AppErrorBoundary>
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
      <button className={page==="expenses"?"active":""} onClick={()=>navigate("expenses")}>
        <span>ًں‘›</span><small>ط§ظ„ظ…طµط±ظˆظپط§طھ</small>
      </button>
      <button className={page==="more"?"active":""} onClick={()=>navigate("more")}>
        <span>â€¢â€¢â€¢</span><small>ط§ظ„ظ…ط²ظٹط¯</small>
      </button>
    </nav>
  </div>;
}


