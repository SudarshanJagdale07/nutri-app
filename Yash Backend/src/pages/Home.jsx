// frontend/src/pages/Home.jsx
import { Link } from "react-router-dom";
import { useState } from "react";

function Home() {
  const [hoveredCard, setHoveredCard] = useState(null);

  return (
    <div className="min-h-screen bg-[#F2F6F2] text-[#1A202C] overflow-hidden relative font-sans">

      {/* BACKGROUND BLURS */}
      <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-[#00A676] opacity-10 blur-[140px] rounded-full" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-[#D9E6DC] opacity-40 blur-[120px] rounded-full" />

      {/* HERO */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-14 items-center">

          <div className="space-y-6">
            <span className="inline-block px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase bg-[#00A676]/10 text-[#00A676]">
              Next-Gen Nutrition AI
            </span>

            <h2 className="text-6xl font-serif font-bold leading-tight">
              Your Personal <br />
              <span className="text-[#00A676]">AI Nutrition Coach</span>
            </h2>

            <p className="text-lg text-gray-500 max-w-xl">
              Upload any meal and instantly understand calories, macros, and health insights using computer vision and AI.
            </p>

            <div className="flex gap-4 pt-4">
              <Link
                to="/signin"
                className="bg-[#00A676] text-white px-8 py-4 rounded-full font-bold shadow-lg hover:scale-105 transition"
              >
                Get Started →
              </Link>

              <button className="px-8 py-4 rounded-full bg-white shadow-sm font-bold hover:shadow-md transition">
                Learn More
              </button>
            </div>
          </div>

          {/* HERO IMAGE CARD */}
          <div className="relative">
            <div className="bg-white/70 backdrop-blur-xl p-6 rounded-[3rem] shadow-xl">
              <img
                src="https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=700"
                alt="Nutrition AI"
                className="rounded-[2.5rem] shadow-md"
              />
            </div>
          </div>

        </div>
      </section>

      {/* FEATURES */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-serif font-bold">
              Why <span className="text-[#00A676]">NutriAI</span>?
            </h2>
            <p className="text-gray-500 mt-3">
              Designed for clarity, accuracy, and better health decisions
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

            {/* FEATURE CARD */}
            {[
              {
                icon: "📷",
                title: "AI Image Recognition",
                desc: "Detects food items and portion sizes from a single photo using vision models.",
              },
              {
                icon: "📊",
                title: "Smart Analytics",
                desc: "Clear calorie and macro breakdowns with intuitive visual feedback.",
              },
              {
                icon: "🥗",
                title: "Personalized Guidance",
                desc: "Health insights tailored to your nutrition goals and habits.",
              },
            ].map((f, i) => (
              <div
                key={i}
                onMouseEnter={() => setHoveredCard(i)}
                onMouseLeave={() => setHoveredCard(null)}
                className="bg-white/70 backdrop-blur-xl rounded-[2.5rem] p-8 shadow-sm hover:shadow-xl transition group cursor-pointer"
              >
                <div className="w-16 h-16 rounded-full bg-[#F2F6F2] flex items-center justify-center text-3xl shadow-inner mb-6 group-hover:scale-110 transition">
                  {f.icon}
                </div>

                <h3 className="text-2xl font-bold mb-3">
                  {f.title}
                </h3>

                <p className="text-gray-500 leading-relaxed">
                  {f.desc}
                </p>

                <div className="mt-4 text-[#00A676] font-bold text-sm">
                  Learn more →
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-6">
          <div className="bg-white/70 backdrop-blur-xl rounded-[3rem] p-14 text-center shadow-xl">
            <h2 className="text-4xl font-serif font-bold mb-4">
              Start Eating Smarter Today
            </h2>

            <p className="text-gray-500 text-lg mb-8">
              AI-powered nutrition tracking built for simplicity and accuracy.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/signin"
                className="bg-[#00A676] text-white px-10 py-4 rounded-full font-bold shadow-lg hover:scale-105 transition"
              >
                Get Started →
              </Link>

              <Link
                to="/signin"
                className="px-10 py-4 rounded-full bg-white shadow-sm font-bold hover:shadow-md transition"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/60 bg-white/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-8 text-center text-gray-400">
          © 2026 NutriAI — AI-Powered Nutrition Intelligence
        </div>
      </footer>
    </div>
  );
}

export default Home;