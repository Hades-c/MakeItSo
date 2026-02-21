"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
  Tradition: "bg-amber-50 text-amber-700",
  Social: "bg-blue-50 text-blue-700",
  Outdoor: "bg-emerald-50 text-emerald-700",
  Arts: "bg-purple-50 text-purple-700",
  Athletics: "bg-rose-50 text-rose-700",
  Local: "bg-orange-50 text-orange-700",
};

export function ActivitiesCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = dir === "left" ? -300 : 300;
    scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
  };

  return (
    <div className="mt-12 border-t border-gray-100 pt-8 pb-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Life at Davidson</h3>
          <p className="text-xs text-gray-400 mt-0.5">Fun things to do on and around campus</p>
        </div>
        <div className="flex gap-1">
          <button onClick={() => scroll("left")} className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => scroll("right")} className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto carousel-scroll pb-2"
      >
        {DAVIDSON_ACTIVITIES.map((activity) => (
          <div
            key={activity.name}
            className="flex-shrink-0 w-[220px] bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm hover:border-gray-200 transition-all"
          >
            <div className="flex items-start gap-2.5">
              <span className="text-xl">{activity.emoji}</span>
              <div className="min-w-0">
                <h4 className="text-xs font-semibold text-gray-900 mb-0.5">{activity.name}</h4>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[activity.category] || "bg-gray-50 text-gray-600"}`}>
                  {activity.category}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 mt-2 leading-relaxed line-clamp-3">
              {activity.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
