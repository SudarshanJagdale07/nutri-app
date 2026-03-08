// frontend/src/router/index.jsx
import { createBrowserRouter } from "react-router-dom";
import Home from "../pages/Home";
import Signin from "../pages/Signin";
import Signup from "../pages/Signup";
import Dashboard from "../pages/Dashboard";
import Profile from "../pages/Profile";
// LogFood removed intentionally (logging centralized on Dashboard)
import Assistant from "../pages/Assistant";
import History from "../pages/History";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import ProtectedRoute from "../components/ProtectedRoute";
import useUserStore from "../store/user";

/**
 * Wrapper component
 * - Renders Navbar always
 * - Renders Sidebar only if user is signed in
 * - Pushes main content right when sidebar is visible
 */
function WithSidebar({ children }) {
  const { user } = useUserStore();

  return (
    <div className="flex min-h-screen bg-[#F2F6F2]">
      {user && <Sidebar />}
      <div className={`flex-1 ${user ? "md:ml-72" : ""}`}>
        <Navbar />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <WithSidebar>
        <Home />
      </WithSidebar>
    ),
  },
  {
    path: "/signin",
    element: (
      <WithSidebar>
        <Signin />
      </WithSidebar>
    ),
  },
  {
    path: "/signup",
    element: (
      <WithSidebar>
        <Signup />
      </WithSidebar>
    ),
  },
  {
    path: "/dashboard",
    element: (
      <WithSidebar>
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </WithSidebar>
    ),
  },
  {
    path: "/profile",
    element: (
      <WithSidebar>
        <ProtectedRoute>
          <Profile />
        </ProtectedRoute>
      </WithSidebar>
    ),
  },
  // /log-food route removed — logging is centralized on Dashboard
  {
    path: "/assistant",
    element: (
      <WithSidebar>
        <ProtectedRoute>
          <Assistant />
        </ProtectedRoute>
      </WithSidebar>
    ),
  },
  {
    path: "/history",
    element: (
      <WithSidebar>
        <ProtectedRoute>
          <History />
        </ProtectedRoute>
      </WithSidebar>
    ),
  },
]);

export default router;