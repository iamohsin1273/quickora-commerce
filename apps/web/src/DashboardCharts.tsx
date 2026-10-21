import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { formatINR } from "@quickora/shared";

type DashboardChartsProps = {
  salesTrend: Array<{ day: string; revenuePaise: number; orders: number }>;
  categoryPerformance: Array<{ category: string; revenuePaise: number }>;
  orderStatuses: Array<{ status: string; count: number }>;
};

const currency = (value: number) => formatINR(value);

export default function DashboardCharts({ salesTrend, categoryPerformance, orderStatuses }: DashboardChartsProps) {
  return <div className="dashboard-charts">
    <div className="content-card chart-card"><div className="section-head" style={{ marginTop: 0 }}><div><h2>Sales trend</h2><p>Persisted qualifying order revenue · last 7 days</p></div></div><ResponsiveContainer width="100%" height="78%"><AreaChart data={salesTrend}><defs><linearGradient id="fillSales" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#176b45" stopOpacity={0.2} /><stop offset="95%" stopColor="#176b45" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e9ede7" /><XAxis dataKey="day" axisLine={false} tickLine={false} /><YAxis hide /><Tooltip formatter={v => currency(Number(v))} /><Area type="monotone" dataKey="revenuePaise" name="Revenue" stroke="#176b45" fill="url(#fillSales)" strokeWidth={2.5} /></AreaChart></ResponsiveContainer></div>
    <div className="content-card chart-card"><div className="section-head" style={{ marginTop: 0 }}><div><h2>Order volume</h2><p>Persisted non-cancelled orders by day</p></div></div><ResponsiveContainer width="100%" height="78%"><BarChart data={salesTrend}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e9ede7" /><XAxis dataKey="day" axisLine={false} tickLine={false} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="orders" name="Orders" fill="#176b45" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>
    <div className="content-card chart-card"><div className="section-head" style={{ marginTop: 0 }}><div><h2>Category performance</h2><p>Order item sales by current product category</p></div></div>{categoryPerformance.length ? <ResponsiveContainer width="100%" height="78%"><BarChart data={categoryPerformance} layout="vertical" margin={{ left: 8 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e9ede7" /><XAxis type="number" hide /><YAxis type="category" dataKey="category" width={120} tick={{ fontSize: 10 }} /><Tooltip formatter={v => currency(Number(v))} /><Bar dataKey="revenuePaise" name="Item sales" fill="#86a947" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer> : <p className="muted">No order item category data yet.</p>}</div>
    <div className="content-card chart-card"><div className="section-head" style={{ marginTop: 0 }}><div><h2>Order status</h2><p>Persisted current lifecycle states</p></div></div>{orderStatuses.length ? <ResponsiveContainer width="100%" height="78%"><PieChart><Pie data={orderStatuses} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={82} label={({ name, value }) => `${name}: ${value}`}>{orderStatuses.map((entry, index) => <Cell key={entry.status} fill={["#176b45", "#86a947", "#c8f169", "#e6a746", "#cb6b4f", "#7194a1"][index % 6]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <p className="muted">No status data to chart yet.</p>}</div>
  </div>;
}
