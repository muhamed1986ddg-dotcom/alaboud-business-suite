import React, { useEffect, useState } from "react";
import api from "./api";

// الدوال المساعدة الأساسية
const money = n => Number(n || 0).toFixed(2);
const cad = n => `${money(n)} CAD`;

// مكون العملاء المحدث (Customers)
function Customers({ navigate }) {
  const [list, setList] = useState([]);
  const [alerts, setAlerts] = useState({ count: 0, rows: [] });
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const [customersResponse, alertsResponse] = await Promise.all([
        api.get("/customers"),
        api.get("/customer-alerts")
      ]);
      setList(Array.isArray(customersResponse.data) ? customersResponse.data : []);
      setAlerts(alertsResponse.data || { count: 0, rows: [] });
    } catch {
      setError("تعذر تحميل بيانات العملاء");
    }
  }

  useEffect(() => { load(); }, []);

  const totalAccounts = list.reduce((sum, item) => sum + Number(item.totalTransactions || 0), 0);
  const totalPaid = list.reduce((sum, item) => sum + Number(item.totalPaid || 0), 0);
  const finalBalance = list.reduce((sum, item) => sum + Number(item.finalBalance || 0), 0);

  return (
    <div className="clients-container">
      <h2 className="page-title">قائمة العملاء</h2>
      {error && <div className="card customer-error">{error}</div>}

      <div className="stats customer-stats-final">
        <div className="card customer-stat-row">
          <div className="customer-stat-icon">👥</div>
          <span className="customer-stat-label">عدد العملاء</span>
          <strong className="customer-stat-value">{list.length}</strong>
        </div>
        <div className="card customer-stat-row">
          <div className="customer-stat-icon">💳</div>
          <span className="customer-stat-label">مجموع الحسابات الكلي</span>
          <strong className="customer-stat-value">{cad(totalAccounts)}</strong>
        </div>
        <div className="card customer-stat-row">
          <div className="customer-stat-icon">💰</div>
          <span className="customer-stat-label">مجموع المدفوع</span>
          <strong className="customer-stat-value">{cad(totalPaid)}</strong>
        </div>
        <div className="card customer-stat-row final">
          <div className="customer-stat-icon">🧮</div>
          <span className="customer-stat-label">المجموع النهائي (CAD) المتبقي</span>
          <strong className="customer-stat-value">{cad(finalBalance)}</strong>
        </div>
        <div className="card customer-stat-row overdue-card">
          <div className="customer-stat-icon">🕘</div>
          <span className="customer-stat-label">المتأخرون أكثر من أسبوع</span>
          <strong className="customer-stat-value">{alerts.count}</strong>
        </div>
      </div>

      <nav className="bottom-nav">
        <button onClick={() => navigate("more")}>المزيد</button>
        <button onClick={() => navigate("expenses")}>المصروفات</button>
        <button onClick={() => navigate("home")}>الرئيسية</button>
        <button onClick={() => navigate("transfers")}>الحوالات</button>
        <button className="active">العملاء</button>
      </nav>
    </div>
  );
}

// يمكنك إضافة باقي المكونات (Dashboard, Login, إلخ) هنا بنفس الهيكلية الأصلية
export default function App() {
  const [page, setPage] = useState("home");
  const navigate = (p) => setPage(p);

  return (
    <div className="app-wrapper">
      {page === "home" && <Dashboard navigate={navigate} />}
      {page === "customers" && <Customers navigate={navigate} />}
      {/* أضف باقي الصفحات هنا */}
    </div>
  );
}