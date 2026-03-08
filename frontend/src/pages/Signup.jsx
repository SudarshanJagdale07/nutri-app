// frontend/src/pages/Signup.jsx

import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import useUserStore from "../store/user";
import { useForm } from "react-hook-form";
import auth from "../apiManager/auth";
import { setToken } from "../helper";
import toast from "react-hot-toast";

function Signup() {
  const navigate = useNavigate();
  const setUser = useUserStore((state) => state.setUser);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const onSubmit = async (data) => {
    try {
      setLoading(true);
      const response = await auth.signup(data);
      setToken(response.token);
      setUser(response.user);
      toast.success("Account created successfully!");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F6F2] flex items-center justify-center relative overflow-hidden font-sans">

      {/* BACKGROUND BLURS */}
      <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-[#00A676] opacity-10 blur-[140px] rounded-full" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-[#D9E6DC] opacity-40 blur-[120px] rounded-full" />

      {/* SIGN UP CARD */}
      <div className="relative z-10 w-full max-w-[400px] bg-white/70 backdrop-blur-xl rounded-[2.5rem] shadow-lg border border-white/60 px-8 py-9 mx-4">

        {/* HEADER */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-serif font-bold tracking-tight">
            Create your <span className="text-[#00A676]">account.</span>
          </h1>
          <p className="text-gray-500 mt-2 text-sm">
            Start your personalized nutrition journey
          </p>
        </div>

        {/* FORM */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

          {/* NAME */}
          <div>
            <label className="block mb-1 text-[11px] font-black uppercase tracking-widest text-gray-400">
              Name
            </label>
            <input
              type="text"
              placeholder="Enter Your Name"
              {...register("name", { required: "Name is required" })}
              className="w-full px-5 py-3.5 rounded-[1.2rem] bg-white border border-gray-200 focus:outline-none focus:ring-4 focus:ring-[#00A676]/10 focus:border-[#00A676] transition"
            />
            {errors.name && (
              <p className="text-xs text-red-500 mt-1">
                {errors.name.message}
              </p>
            )}
          </div>

          {/* EMAIL */}
          <div>
            <label className="block mb-1 text-[11px] font-black uppercase tracking-widest text-gray-400">
              Email Address
            </label>
            <input
              type="email"
              placeholder="you@nutriai.app"
              {...register("email", { required: "Email is required" })}
              className="w-full px-5 py-3.5 rounded-[1.2rem] bg-white border border-gray-200 focus:outline-none focus:ring-4 focus:ring-[#00A676]/10 focus:border-[#00A676] transition"
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
              className="w-full px-5 py-3.5 rounded-[1.2rem] bg-white border border-gray-200 focus:outline-none focus:ring-4 focus:ring-[#00A676]/10 focus:border-[#00A676] transition"
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
            className="w-full mt-4 bg-[#00A676] hover:bg-[#00966A] text-white py-3.5 rounded-full font-bold text-base shadow-lg hover:scale-[1.02] transition active:scale-[0.98]"
          >
            {loading ? "Creating account..." : "Create account →"}
          </button>
        </form>

        {/* FOOTER */}
        <div className="text-center mt-8 pt-5 border-t border-gray-200">
          <NavLink to="/signin" className="text-sm text-gray-500">
            Already have an account?{" "}
            <span className="text-[#00A676] font-bold hover:underline underline-offset-4">
              Sign in
            </span>
          </NavLink>
        </div>
      </div>
    </div>
  );
}

export default Signup;