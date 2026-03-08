/**
 * Generates trippy, Gen-Z, Bollywood-style notification messages.
 * 
 * @param {string} type - The type of notification (meal, water, protein, calorieSurplus, sleep, fiber)
 * @param {object} userData - Optional user data for personalization (userName, currentWater, currentProtein, etc.)
 * @returns {object} { title, body, emoji }
 */
export const getNotificationMessage = (type, userData = {}) => {
  const { userName = "bro" } = userData;

  const messages = {
    meal: [
      {
        title: "Missing Persons Report 🚨",
        body: `⚠️ ${userName}. It's 2PM. Your metabolism is filing a missing persons report. Feed yourself.`,
        emoji: "🍔"
      },
      {
        title: "Bhai, where is the food? 😭",
        body: "Your stomach is doing the angry Bollywood villain laugh. Pls eat something before you pass out.",
        emoji: "🍛"
      },
      {
        title: "Aura Points Dropping 📉",
        body: "Skipping lunch is not very mindful, not very demure. Secure the bag (of food).",
        emoji: "🧘"
      },
      {
        title: "Swiggy Uncle is waiting 🛵",
        body: "Kha le bhai. Even your shadow is looking thin today.",
        emoji: "🍲"
      },
      {
        title: "Are you photosynthesizing? 🌿",
        body: "Because unless you're a plant, you need solid food right now.",
        emoji: "🥗"
      }
    ],

    water: [
      {
        title: "Hydrate or Diedrate ☠️",
        body: "🌊 Your cells are literally shriveling like raisins rn. Drink water. Become the ocean.",
        emoji: "💧"
      },
      {
        title: "Jal Lijiye Thakk Gaye Honge 🥤",
        body: `Drink water ${userName}. Your kidneys are preparing a powerpoint presentation on why they hate you.`,
        emoji: "🚰"
      },
      {
        title: "Desert Vibes Only? 🏜️",
        body: "Bro is trying to become a cactus. Have some paani before you become a mirage.",
        emoji: "🌵"
      },
      {
        title: "Water Check 🌊",
        body: "Pee color check: If it looks like Nimbooz, we have a problem. Drink up bestie.",
        emoji: "🍋"
      },
      {
        title: "Thirsty much? 🥵",
        body: "You're 70% water but currently acting like 100% dry humor. Hydrate.",
        emoji: "🧊"
      }
    ],

    protein: [
      {
        title: "Muscles are Disappointed 📉",
        body: "🥩 Your muscles called. They're not mad. Just disappointed. Eat some protein, king.",
        emoji: "💪"
      },
      {
        title: "Where are the Gains? 🔍",
        body: "Bro wants to look like Hrithik but is eating like a pigeon. Get that protein in.",
        emoji: "🍗"
      },
      {
        title: "Paneer Samajh Ke Kha Ja 🧀",
        body: "Your protein intake is looking like a joke right now. Fix it before your biceps leave you.",
        emoji: "🥚"
      },
      {
        title: "Protein Deficiency Era 💀",
        body: "You're living in your flop era right now. Eat some Dal, Chicken or Soya rn.",
        emoji: "🍛"
      },
      {
        title: "Gains Status: 404 Not Found 🚫",
        body: "System error: Protein levels critically low. Please fuel up.",
        emoji: "🥩"
      }
    ],

    calorieSurplus: [
      {
        title: "Calculations Failed 📈",
        body: "📈 The calories? Stacking. The gains? Optional. Your future self is watching you rn. Choose wisely.",
        emoji: "⚖️"
      },
      {
        title: "Diet Plan Left the Chat 🏃",
        body: "Bhai, control majnu control. We are crossing limits today.",
        emoji: "🛑"
      },
      {
        title: "Heavy Driver Vibes 🏎️",
        body: "You're eating in surplus like someone else is paying the bill.",
        emoji: "🍕"
      },
      {
        title: "Are we bulking? 🐘",
        body: "Just checking if we entered a secret bulking phase or if you just saw a Swiggy discount.",
        emoji: "🍔"
      },
      {
        title: "Too Much Sauce 🥫",
        body: "You're going over the limit. Step away from the fridge and nobody gets hurt.",
        emoji: "🚨"
      }
    ],

    sleep: [
      {
        title: "Not Built Different 😵",
        body: "😵 3 days of trash sleep. You're not built different. You're just tired and pretending. Rest is not weakness, legend.",
        emoji: "🛌"
      },
      {
        title: "Sleep is a Myth? 🦉",
        body: `Bro thinks he's Batman. Go to sleep ${userName}, Gotham will be fine tomorrow.`,
        emoji: "🦇"
      },
      {
        title: "Dark Circles Pro Max 🐼",
        body: "You're looking like a raccoon right now. Pls get some 8 hours of sleep.",
        emoji: "💤"
      },
      {
        title: "So Jaa Bhai 🌙",
        body: "Even your phone battery sleeps more than you. Plug yourself in.",
        emoji: "🔌"
      },
      {
        title: "System Reboot Required 🔄",
        body: "Your brain tabs are crashing. Time to close your eyes.",
        emoji: "🥱"
      }
    ],

    fiber: [
      {
        title: "Gut Protest 🥦",
        body: "🥦 Your gut microbiome is staging a protest. Add some fiber. Let the vegetables win today.",
        emoji: "🥬"
      },
      {
        title: "Constipation Station 🚂",
        body: "If you don't eat fiber today, tomorrow morning will be a Bollywood tragedy.",
        emoji: "🚽"
      },
      {
        title: "Where are the veggies? 🥕",
        body: "Your stomach is begging for some roughage. Eat an apple bro.",
        emoji: "🍎"
      },
      {
        title: "Ghas-Phoos Alert 🥗",
        body: "Time to eat like a rabbit for a bit. Your digestion needs help.",
        emoji: "🐇"
      },
      {
        title: "Fiber Check Failed ❌",
        body: "Veggies are not your enemy. Eat them before your stomach declares war.",
        emoji: "🥗"
      }
    ]
  };

  const selectedCategory = messages[type] || [
    {
      title: "Hey Bro! 👋",
      body: "Just checking in. Stay healthy, stay trippy.",
      emoji: "✨"
    }
  ];

  const randomIndex = Math.floor(Math.random() * selectedCategory.length);
  return selectedCategory[randomIndex];
};
