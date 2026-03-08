// frontend/src/components/Sidebar.jsx
import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { removeToken } from "../helper";
import useUserStore from "../store/user";
import toast from "react-hot-toast";

/**
 * Sidebar
 * - Fixed on the left, full height of screen
 * - Collapsible on mobile
 * - Only rendered if user is signed in (handled in router wrapper)
 */

function Sidebar() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { clearUser } = useUserStore();

  const handleLogout = () => {
    removeToken();
    clearUser();
    // setLogoutFlag is handled in Navbar signout flow; keep this simple
    navigate("/signin");
    toast.success("Logged out");
  };

  const navItemClass = (path) =>
    `relative flex items-center gap-3 px-4 py-3 rounded-2xl font-medium transition-all duration-300 group
     ${
       location.pathname === path
         ? "bg-[#00A676]/10 text-[#00A676] shadow-sm"
         : "text-gray-600 hover:bg-gray-100 hover:text-[#00A676]"
     }`;

  return (
    <>
      {/* Hamburger for mobile */}
      <button
        className="md:hidden fixed top-4 left-4 z-50 px-3 py-2 bg-[#00A676] text-white rounded-xl shadow-lg hover:scale-105 transition"
        onClick={() => setOpen(!open)}
      >
        ☰
      </button>

      {/* Dark overlay for mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-screen w-72 bg-white/80 backdrop-blur-2xl border-r border-gray-200 shadow-xl p-8 flex flex-col transition-transform duration-300 z-40
          ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* Logo */}
        <h2
          onClick={() => navigate("/dashboard")}
          className="text-3xl font-serif font-bold mb-12 cursor-pointer tracking-tight"
        >
          Nutri<span className="text-[#00A676]">AI</span>
        </h2>

        {/* Navigation */}
        <nav className="flex flex-col gap-3 flex-1">
          {/* Removed Log Food link — logging is centralized on Dashboard */}
          <Link
            to="/dashboard"
            className={navItemClass("/dashboard")}
            onClick={() => setOpen(false)}
          >
            <span className="text-xl">📊</span>
            <span>Dashboard</span>
          </Link>

          <Link
            to="/assistant"
            className={navItemClass("/assistant")}
            onClick={() => setOpen(false)}
          >
            <span className="text-xl">🤖</span>
            <span>AI Assistant</span>
          </Link>

          <Link
            to="/history"
            className={navItemClass("/history")}
            onClick={() => setOpen(false)}
          >
            <span className="text-xl">📈</span>
            <span>History & Progress</span>
          </Link>

          <Link
            to="/profile"
            className={navItemClass("/profile")}
            onClick={() => setOpen(false)}
          >
            <span className="text-xl">👤</span>
            <span>Profile</span>
          </Link>
        </nav>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="mt-6 flex items-center gap-3 px-4 py-3 rounded-2xl text-gray-600 hover:text-red-600 hover:bg-red-50 transition-all duration-300"
        >
          <span className="text-xl">🚪</span>
          <span className="font-medium">Logout</span>
        </button>
      </aside>
    </>
  );
}

export default Sidebar;