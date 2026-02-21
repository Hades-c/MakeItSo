"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface Activity {
  name: string;
  description: string;
  emoji: string;
  category: string;
}

const DAVIDSON_ACTIVITIES: Activity[] = [
  { name: "Spring Frolics", description: "Multi-day spring celebration with live concerts, food trucks, and lawn parties on Patterson Court.", emoji: "🎉", category: "Tradition" },
  { name: "The Cake Race", description: "Iconic race since 1934 — every first-year runs. Cross the finish line first and win a cake!", emoji: "🏃", category: "Tradition" },
  { name: "Nummit Coffee", description: "Davidson's beloved Summit Coffee campus spot. Perfect for studying, avocado toast, and seasonal drinks.", emoji: "☕", category: "Social" },
  { name: "Lake Campus", description: "110-acre lakefront on Lake Norman. Paddleboard, kayak, sand volleyball, or just catch some sun.", emoji: "🛶", category: "Outdoor" },
  { name: "Flickerball", description: "Invented at Davidson in 1951 — a unique sport where first-year halls battle in intramural tournaments.", emoji: "🏈", category: "Tradition" },
  { name: "Patterson Court", description: "Eight fraternities and four eating houses on one street. Open parties, live DJs, and the whole campus.", emoji: "✨", category: "Social" },
  { name: "Midnight Scream", description: "Before finals, the entire campus erupts in a collective scream at midnight. Weird? Yes. Therapeutic? Absolutely.", emoji: "📢", category: "Tradition" },
  { name: "'Cats Excursions", description: "Free shuttle trips to Panthers games, Hornets games, musicals, Whitewater Center, and Asheville day trips.", emoji: "🚌", category: "Social" },
  { name: "Davidson Outdoors", description: "Student-led whitewater kayaking, backpacking, rock climbing, and caving trips. Financial aid covers costs!", emoji: "⛰️", category: "Outdoor" },
  { name: "Trivia at Nummit", description: "Wednesday night trivia packs Nummit. Grab your squad and prove you're the smartest Wildcats on campus.", emoji: "🧠", category: "Social" },
  { name: "Eating House Day", description: "Find out your eating house placement — think Hogwarts Sorting Hat but with more screaming and celebrations.", emoji: "🏠", category: "Tradition" },
  { name: "Porch Concerts", description: "Live local bands on Nummit's porch every Friday afternoon. Even professors show up. Peak Davidson vibes.", emoji: "🎸", category: "Arts" },
  { name: "Wildcat Basketball", description: "Davidson's D-I basketball is nationally known and the games are electric. THE campus event.", emoji: "🏀", category: "Athletics" },
  { name: "Commonsgiving", description: "Massive Thanksgiving feast at Vail Commons with traditional sides and tons of pie. Bring your appetite!", emoji: "🍽️", category: "Tradition" },
  { name: "Christmas in Davidson", description: "The town transforms into a holiday wonderland — hot cocoa, dog fashion show, vendors, and small-town magic.", emoji: "🎄", category: "Tradition" },
  { name: "Oops! Improv", description: "Davidson's improv comedy troupe puts on hilarious shows all year. They started the Honor Cod fish-signing tradition.", emoji: "😂", category: "Arts" },
  { name: "A Cappella Shows", description: "From The Nuances to The Generals — pop covers and original arrangements. Campus entertainment at its finest.", emoji: "🎤", category: "Arts" },
  { name: "Downtown Davidson", description: "Main Street Books, The Soda Shop (since 1951!), Kindred restaurant, and the Saturday Farmers Market.", emoji: "🚶", category: "Local" },
  { name: "Finals Breakfast", description: "During finals, professors serve students late-night breakfast at Vail Commons, plus therapy dogs visit.", emoji: "🥞", category: "Tradition" },
  { name: "Whitewater Center", description: "30 minutes away — rafting, ziplining, ropes courses, mountain biking, and 50 miles of trails. Free with 'Cats!", emoji: "🌊", category: "Outdoor" },
  { name: "Lake Norman Sailing", description: "Join club sailing or crew and train at Lake Campus. Sail, row at sunrise, or water ski on the Carolinas' largest lake.", emoji: "⛵", category: "Athletics" },
  { name: "Winterfest", description: "Union Board's signature winter celebration with festive events, performances, and seasonal fun.", emoji: "❄️", category: "Tradition" },
];

const CATEGORY_COLORS: Record<string, string> = {
  Tradition: "text-davidson",
  Social: "text-navy",
  Outdoor: "text-emerald-600",
  Arts: "text-purple-600",
  Athletics: "text-davidson",
  Local: "text-amber-600",
};

export function ActivitiesCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const advance = useCallback(() => {
    setIndex((i) => (i + 1) % DAVIDSON_ACTIVITIES.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(advance, 5000);
    return () => clearInterval(id);
  }, [paused, advance]);

  const activity = DAVIDSON_ACTIVITIES[index];

  return (
    <div className="py-3">
      <div
        className="flex items-center gap-3 cursor-default select-none"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onClick={advance}
      >
        <span className="text-[10px] font-medium text-gray-300 uppercase tracking-widest whitespace-nowrap">
          Life at Davidson
        </span>

        <span className="text-gray-200">·</span>

        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className="flex items-center gap-2 min-w-0"
          >
            <span className="text-sm">{activity.emoji}</span>
            <span className="text-xs font-medium text-gray-700">{activity.name}</span>
            <span className={`text-[10px] font-medium ${CATEGORY_COLORS[activity.category] || "text-gray-500"}`}>
              {activity.category}
            </span>
            <span className="text-[11px] text-gray-400 truncate hidden sm:inline">
              — {activity.description}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
