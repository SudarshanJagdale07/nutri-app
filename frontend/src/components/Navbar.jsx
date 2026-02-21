// frontend/src/components/Navbar.jsx
import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useUserStore from "../store/user";
import { removeToken, getToken } from "../helper";
import toast from "react-hot-toast";

function Navbar() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const dropdownRef = useRef(null); // ✅ declare dropdownRef here

  const { user, clearUser, setLogoutFlag } = useUserStore(); // add setLogoutFlag

  const handleSignOut = () => {
    // Signal an intentional logout so ProtectedRoute will suppress its toast
    if (setLogoutFlag) setLogoutFlag();

    // Clear auth synchronously
    removeToken();
    clearUser();

    // Show logout toast
    toast.success("Logged out successfully!");

    // Navigate to signin (or "/" if you prefer home)
    navigate("/signin");
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <nav className="fixed top-0 inset-x-0 z-50">
      <div className="bg-white/70 backdrop-blur-xl border-b border-white/60 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* LOGO */}
          <div
            onClick={() => {
              // ✅ if signed in go to dashboard, else home
              if (getToken() && user) {
                navigate("/dashboard");
              } else {
                navigate("/");
              }
            }}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#00A676] flex items-center justify-center shadow-md group-hover:rotate-6 transition-transform">
              🌿
            </div>
            <span className="text-2xl font-extrabold tracking-tight">
              Nutri<span className="text-[#00A676]">AI</span>
            </span>
          </div>

          {/* RIGHT ACTIONS */}
          <div className="relative" ref={dropdownRef}>
            {user && getToken() ? (
              // ✅ show circular avatar dropdown if signed in
              <>
                <button
                  onClick={() => setOpen(!open)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center
                    bg-[#F2F6F2] border border-white shadow-inner
                    hover:shadow-md transition-all
                    ${open ? "ring-2 ring-[#00A676]/40" : ""}
                  `}
                >
                  {/* simple user icon */}
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#1A202C"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </button>

                {/* DROPDOWN */}
                <div
                  className={`absolute right-0 mt-3 w-44 origin-top-right
                    transition-all duration-200 ease-out
                    ${open ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"}
                  `}
                >
                  <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-white/60 overflow-hidden">
                    <button
                      onClick={() => {
                        navigate("/profile");
                        setOpen(false);
                      }}
                      className="w-full px-4 py-3 text-sm font-medium text-left text-gray-700 hover:bg-[#F2F6F2] transition"
                    >
                      👤 Profile
                    </button>

                    <div className="h-px bg-gray-100" />

                    <button
                      onClick={handleSignOut}
                      className="w-full px-4 py-3 text-sm font-semibold text-left text-red-600 hover:bg-red-50 transition"
                    >
                      ⎋ Sign Out
                    </button>
                  </div>
                </div>
              </>
            ) : (
              // show Sign In button if not signed in
              <button
                onClick={() => navigate("/signin")}
                className="px-5 py-2 rounded-full bg-[#00A676] text-white font-semibold shadow-md hover:bg-[#00966A] transition"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;