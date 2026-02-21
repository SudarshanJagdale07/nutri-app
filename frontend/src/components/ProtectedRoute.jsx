// frontend/src/components/ProtectedRoute.jsx
import React, { useRef } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getToken } from "../helper";
import useUserStore from "../store/user";
import toast from "react-hot-toast";

/**
 * ProtectedRoute
 * - Guards protected pages (dashboard, profile, log-food, assistant, history)
 * - Shows "Please sign in to continue" toast only if access is blocked
 *   due to missing auth, not when user intentionally logs out
 */
const ProtectedRoute = ({ children }) => {
  const token = getToken();
  const { user, logoutFlag, clearLogoutFlag } = useUserStore();
  const location = useLocation();
  const hasShownToast = useRef(false);

  // Define which paths are protected
  const protectedPaths = ["/dashboard", "/profile", "/log-food", "/assistant", "/history"];
  const isProtected = protectedPaths.some((path) => location.pathname.startsWith(path));

  if (isProtected) {
    if (!token || !user) {
      // Suppress toast if this redirect is caused by intentional logout
      if (!logoutFlag) {
        if (!hasShownToast.current) {
          toast.error("Please sign in to continue");
          hasShownToast.current = true;
        }
      } else {
        // Clear the flag immediately so future redirects show the toast normally
        clearLogoutFlag();
      }

      return <Navigate to={`/signin?redirect=${location.pathname}`} replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;