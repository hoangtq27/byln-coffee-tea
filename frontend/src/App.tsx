import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Layout";
import { useAuth, type Role } from "./lib/auth";
import Login from "./pages/Login";
import Orders from "./pages/Orders";
import OrderForm from "./pages/OrderForm";
import Dishes from "./pages/Dishes";
import RevenueReport from "./pages/RevenueReport";
import RevenueCompare from "./pages/RevenueCompare";
import Employees from "./pages/Employees";
import Shifts from "./pages/Shifts";
import Accounts from "./pages/Accounts";
import AccountForm from "./pages/AccountForm";

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <div className="splash">Đang tải...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Shell />;
}

function RoleGate({ role }: { role: Role }) {
  const { user } = useAuth();
  if (user?.role !== role) return <Navigate to="/orders" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected />}>
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/new" element={<OrderForm mode="create" />} />
        <Route path="/orders/:id/edit" element={<OrderForm mode="edit" />} />
        <Route path="/dishes" element={<Dishes />} />
        <Route element={<RoleGate role="manager" />}>
          <Route path="/revenue/report" element={<RevenueReport />} />
          <Route path="/revenue/compare" element={<RevenueCompare />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/shifts" element={<Shifts />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/accounts/new" element={<AccountForm mode="create" />} />
          <Route path="/accounts/:ma/edit" element={<AccountForm mode="edit" />} />
        </Route>
        <Route path="*" element={<Navigate to="/orders" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
