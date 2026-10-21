import { Route, Routes, Link } from 'react-router-dom';
import Header from './components/Header.jsx';
import Home from './pages/Home.jsx';
import Trending from './pages/Trending.jsx';
import Cart from './pages/Cart.jsx';
import Order from './pages/Order.jsx';
import MyOrders from './pages/MyOrders.jsx';
import Admin from './pages/admin/Admin.jsx';
import Policy from './pages/Policies.jsx';
import Footer from './components/Footer.jsx';
import { StatusBanner } from './components/ShopStatus.jsx';

export default function App() {
  return (
    <>
      <Header />
      <main className="container">
        <StatusBanner />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/trending" element={<Trending />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/orders" element={<MyOrders />} />
          <Route path="/order/:id" element={<Order />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/:page" element={<Policy />} />
          <Route path="*" element={<p className="empty">Page not found. <Link to="/">Go home</Link></p>} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
