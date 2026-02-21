// frontend/src/pages/Signin.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useUserStore from "../store/user";
import { useForm } from 'react-hook-form';
import auth from "../apiManager/auth";   // assumed API manager
import { setToken } from '../helper';
import toast from "react-hot-toast";

function Signin() {
  const navigate = useNavigate();
  const setUser = useUserStore((state) => state.setUser);
  const [loading, setLoading] = useState(false);

  // react-hook-form setup
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm();

  // handle form submit
  const onSubmit = async (data) => {
    try {
      setLoading(true);
      const response = await auth.signin(data); 
      // expected response: { token, user }
      if (response?.token) {
        setToken(response.token);
        setUser(response.user);
        toast.success("Signed in successfully!");

        // Redirect to dashboard
        navigate("/dashboard");
      } else {
        toast.error("Invalid credentials, please try again.");
      }
    } catch (error) {
      console.error(error);
      toast.error(error?.message || "Something went wrong!");
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-[#F2F6F2] flex items-center justify-center relative overflow-hidden font-sans">
      {/* BACKGROUND BLURS */}
      <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-[#00A676] opacity-10 blur-[140px] rounded-full" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-[#D9E6DC] opacity-40 blur-[120px] rounded-full" />

      {/* SIGN IN CARD */}
      <div className="relative z-10 w-full max-w-[440px] bg-white/70 backdrop-blur-xl rounded-[3rem] shadow-lg border border-white/60 px-10 py-12 mx-4">
        {/* HEADER */}
        <div className="text-center mb-10">
          <h1 className="text-5xl font-serif font-bold tracking-tight">
            Welcome <span className="text-[#00A676]">back.</span>
          </h1>
          <p className="text-gray-500 mt-3">
            Sign in to continue your nutrition journey
          </p>
        </div>

        {/* FORM */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* EMAIL */}
          <div>
            <label className="block mb-1 text-[11px] font-black uppercase tracking-widest text-gray-400">
              Email Address
            </label>
            <input
              type="email"
              placeholder="you@nutriai.app"
              {...register("email", { required: "Email is required" })}
              className="w-full px-6 py-4 rounded-[1.4rem] bg-white border border-gray-200 focus:outline-none focus:ring-4 focus:ring-[#00A676]/10 focus:border-[#00A676] transition"
            />
            {errors.email && (
              <p className="text-xs text-red-500 mt-1">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* PASSWORD */}
          <div>
            <label className="block mb-1 text-[11px] font-black uppercase tracking-widest text-gray-400">
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              {...register("password", { required: "Password is required" })}
              className="w-full px-6 py-4 rounded-[1.4rem] bg-white border border-gray-200 focus:outline-none focus:ring-4 focus:ring-[#00A676]/10 focus:border-[#00A676] transition"
            />
            {errors.password && (
              <p className="text-xs text-red-500 mt-1">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* BUTTON */}
          <button
            type="submit"
            className="w-full mt-6 bg-[#00A676] hover:bg-[#00966A] text-white py-4 rounded-full font-bold text-lg shadow-lg hover:scale-[1.02] transition active:scale-[0.98]"
          >
            {loading ? "Signing in..." : "Sign In →"}
          </button>
        </form>

        {/* FOOTER */}
        <div className="text-center mt-10 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            New to NutriAI?{" "}
            <a
              href="/signup"
              className="text-[#00A676] font-bold hover:underline underline-offset-4"
            >
              Create an account
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Signin;