// frontend/src/layout/AppLayout.jsx
import React from "react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import useUserStore from "../store/user";

/**
 * AppLayout
 * - Sidebar fixed on left (w-72)
 * - Main content shifted right with ml-72
 * - Navbar always visible at top
 */
function AppLayout({ children }) {
  const { user } = useUserStore();

  return (
    <div className="flex min-h-screen bg-[#F2F6F2]">
      {user && <Sidebar />}
      <div className={`flex-1 ${user ? "md:ml-72" : ""}`}>
        <Navbar />
        <main>{children}</main>
      </div>
    </div>
  );
}

export default AppLayout;