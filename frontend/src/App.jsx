// frontend/src/App.jsx
import { RouterProvider } from "react-router-dom";
import router from "./router";
import { Toaster } from "react-hot-toast";

function App() {
  return (
    <>
      <RouterProvider router={router} />
      {/* Mount Toaster once at root */}
      <Toaster position="top-center" reverseOrder={false} />
    </>
  );
}

export default App;