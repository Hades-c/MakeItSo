#!/usr/bin/env python3
"""Generate a hackathon pitch deck for MakeItSo."""

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR, MSO_AUTO_SIZE
from pptx.enum.shapes import MSO_SHAPE

# Brand colors
DAVIDSON_RED = RGBColor(0x8C, 0x1D, 0x1D)
NAVY = RGBColor(0x1E, 0x2A, 0x38)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
LIGHT_GRAY = RGBColor(0xF8, 0xF9, 0xFB)
MEDIUM_GRAY = RGBColor(0x6B, 0x72, 0x80)
DARK_TEXT = RGBColor(0x11, 0x11, 0x11)
ACCENT_GREEN = RGBColor(0x10, 0xB9, 0x81)
ACCENT_BLUE = RGBColor(0x3B, 0x82, 0xF6)
ACCENT_PURPLE = RGBColor(0x8B, 0x5C, 0xF6)
ACCENT_AMBER = RGBColor(0xF5, 0x9E, 0x0B)
ACCENT_PINK = RGBColor(0xEC, 0x48, 0x99)
SUBTLE_NAVY = RGBColor(0x2A, 0x3A, 0x4E)
DIM_BLUE = RGBColor(0xA0, 0xAE, 0xC0)
DIMMER_BLUE = RGBColor(0x6B, 0x7B, 0x90)

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

W = prs.slide_width
H = prs.slide_height


def add_bg(slide, color):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color


def add_rect(slide, left, top, width, height, color):
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()
    return shape


def add_rounded_rect(slide, left, top, width, height, color):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()
    return shape


def add_circle(slide, left, top, size, color):
    shape = slide.shapes.add_shape(MSO_SHAPE.OVAL, left, top, size, size)
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()
    return shape


def _setup_tf(tf):
    """Apply consistent text frame settings to prevent overflow."""
    tf.word_wrap = True
    tf.auto_size = MSO_AUTO_SIZE.TEXT_TO_FIT_SHAPE
    tf.margin_left = Inches(0.04)
    tf.margin_right = Inches(0.04)
    tf.margin_top = Inches(0.02)
    tf.margin_bottom = Inches(0.02)


def _setup_p(p, text, size, color, bold, font, align):
    """Apply consistent paragraph settings."""
    p.text = text
    p.font.size = Pt(size)
    p.font.color.rgb = color
    p.font.bold = bold
    p.font.name = font
    p.alignment = align
    p.space_after = Pt(0)
    p.space_before = Pt(0)
    p.line_spacing = Pt(int(size * 1.25))


def add_text(slide, left, top, width, height, text, size=18,
             color=DARK_TEXT, bold=False, align=PP_ALIGN.LEFT, font="Calibri"):
    """Add a single text box with auto-shrink."""
    txBox = slide.shapes.add_textbox(left, top, width, height)
    _setup_tf(txBox.text_frame)
    _setup_p(txBox.text_frame.paragraphs[0], text, size, color, bold, font, align)
    return txBox


def add_para_text(slide, left, top, width, height, lines, align=PP_ALIGN.LEFT, font="Calibri"):
    """Add a text box with multiple paragraphs.
    lines = [(text, size, color, bold), ...]
    """
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    _setup_tf(tf)
    for i, item in enumerate(lines):
        text = item[0]
        size = item[1] if len(item) > 1 else 14
        color = item[2] if len(item) > 2 else DARK_TEXT
        bold = item[3] if len(item) > 3 else False
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        _setup_p(p, text, size, color, bold, font, align)
        p.space_after = Pt(int(size * 0.35))
    return txBox


# ============================================================
# SLIDE 1: TITLE
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, NAVY)
add_rect(slide, Inches(0), Inches(0), W, Inches(0.06), DAVIDSON_RED)
add_circle(slide, Inches(10.5), Inches(0.5), Inches(3), SUBTLE_NAVY)
add_circle(slide, Inches(-1), Inches(5), Inches(2.5), SUBTLE_NAVY)

icon = add_rounded_rect(slide, Inches(5.9), Inches(1.6), Inches(1.5), Inches(1.5), DAVIDSON_RED)
add_text(slide, Inches(5.9), Inches(1.75), Inches(1.5), Inches(1.2),
         "MIS", size=36, color=WHITE, bold=True, align=PP_ALIGN.CENTER, font="Georgia")

add_text(slide, Inches(1.5), Inches(3.5), Inches(10.3), Inches(1),
         "MakeItSo", size=60, color=WHITE, bold=True, align=PP_ALIGN.CENTER, font="Georgia")

add_text(slide, Inches(2), Inches(4.7), Inches(9.3), Inches(0.8),
         "AI-powered course planning that connects what you study to where you're going.",
         size=22, color=DIM_BLUE, align=PP_ALIGN.CENTER)

add_text(slide, Inches(2), Inches(6.3), Inches(9.3), Inches(0.5),
         "hack@DAVIDSON 2025  |  Built for Davidson College Students",
         size=14, color=DIMMER_BLUE, align=PP_ALIGN.CENTER)


# ============================================================
# SLIDE 2: THE PROBLEM
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_rect(slide, Inches(0), Inches(0), Inches(0.08), H, DAVIDSON_RED)

add_text(slide, Inches(0.8), Inches(0.6), Inches(3), Inches(0.4),
         "THE PROBLEM", size=13, color=DAVIDSON_RED, bold=True)
add_text(slide, Inches(0.8), Inches(1.1), Inches(11), Inches(0.7),
         "Students pick courses blind to career outcomes.",
         size=38, color=NAVY, bold=True, font="Georgia")

problems = [
    ("No career connection",
     "Students choose courses with zero visibility into how they map to actual careers."),
    ("Information overload",
     "463 courses, 24 departments. Generic advisor meetings aren't enough."),
    ("Networking anxiety",
     "Alumni can help, but students don't know what to say or who to reach."),
    ("Professor roulette",
     "RateMyProfessors is noisy. No synthesized, actionable professor intel."),
]

for i, (title, desc) in enumerate(problems):
    x = Inches(0.8) + Inches(3.1) * i
    y = Inches(2.4)
    add_rounded_rect(slide, x, y, Inches(2.85), Inches(4.0), LIGHT_GRAY)

    nc = add_circle(slide, x + Inches(1.05), y + Inches(0.3), Inches(0.65), DAVIDSON_RED)
    add_text(slide, x + Inches(1.05), y + Inches(0.37), Inches(0.65), Inches(0.5),
             str(i + 1), size=22, color=WHITE, bold=True, align=PP_ALIGN.CENTER)

    add_text(slide, x + Inches(0.25), y + Inches(1.25), Inches(2.35), Inches(0.5),
             title, size=17, color=NAVY, bold=True, font="Georgia", align=PP_ALIGN.CENTER)

    add_text(slide, x + Inches(0.25), y + Inches(1.9), Inches(2.35), Inches(1.8),
             desc, size=13, color=MEDIUM_GRAY, align=PP_ALIGN.CENTER)


# ============================================================
# SLIDE 3: THE SOLUTION
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_rect(slide, Inches(0), Inches(0), Inches(0.08), H, DAVIDSON_RED)

add_text(slide, Inches(0.8), Inches(0.6), Inches(3), Inches(0.4),
         "THE SOLUTION", size=13, color=DAVIDSON_RED, bold=True)
add_text(slide, Inches(0.8), Inches(1.1), Inches(11), Inches(0.7),
         'Don\'t ask "what courses?" Ask "what career?"',
         size=38, color=NAVY, bold=True, font="Georgia")

add_text(slide, Inches(0.8), Inches(2.0), Inches(11), Inches(0.6),
         "MakeItSo flips planning on its head. Start with your dream career, and AI builds your entire roadmap backward\u2014courses, people, activities, timeline.",
         size=16, color=MEDIUM_GRAY)

paths = [
    ("Plan Forward", "Start with your interests", ACCENT_GREEN,
     ["Tell us what fascinates you", "Get AI course recommendations", "Explore 24 career paths", "Discover new possibilities"]),
    ("Plan Backward", "Start with your dream career", DAVIDSON_RED,
     ["Pick your target role", "AI generates full action plan", "Courses + People + Activities", "Follow your roadmap to success"]),
]

for i, (title, subtitle, color, steps) in enumerate(paths):
    x = Inches(1.5) + Inches(5.5) * i
    y = Inches(3.0)
    add_rounded_rect(slide, x, y, Inches(4.8), Inches(4.0), LIGHT_GRAY)
    add_rect(slide, x, y, Inches(4.8), Inches(0.06), color)

    add_text(slide, x + Inches(0.4), y + Inches(0.3), Inches(4), Inches(0.5),
             title, size=24, color=NAVY, bold=True, font="Georgia")
    add_text(slide, x + Inches(0.4), y + Inches(0.85), Inches(4), Inches(0.4),
             subtitle, size=14, color=color, bold=True)

    for j, step in enumerate(steps):
        sy = y + Inches(1.5) + Inches(0.55) * j
        add_circle(slide, x + Inches(0.4), sy + Inches(0.03), Inches(0.3), color)
        add_text(slide, x + Inches(0.4), sy + Inches(0.05), Inches(0.3), Inches(0.25),
                 str(j + 1), size=11, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
        add_text(slide, x + Inches(0.9), sy + Inches(0.03), Inches(3.5), Inches(0.35),
                 step, size=14, color=DARK_TEXT)


# ============================================================
# SLIDE 4: KEY FEATURES (1 of 2)
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_rect(slide, Inches(0), Inches(0), Inches(0.08), H, DAVIDSON_RED)

add_text(slide, Inches(0.8), Inches(0.6), Inches(3), Inches(0.4),
         "KEY FEATURES", size=13, color=DAVIDSON_RED, bold=True)
add_text(slide, Inches(0.8), Inches(1.1), Inches(11), Inches(0.7),
         "Six AI-powered tools, one platform.",
         size=38, color=NAVY, bold=True, font="Georgia")

features1 = [
    ("Smart Course Explorer",
     "463 real Davidson courses with live enrollment, RateMyProfessors ratings, and AI-generated insights for key topics, skills, and career connections.",
     ACCENT_BLUE),
    ("AI Career Planner",
     "Tell us your dream career. Gemini generates a complete action plan: recommended courses, people to meet, activities to do, and Davidson-specific insights.",
     DAVIDSON_RED),
    ("4-Year Roadmap Builder",
     "AI creates optimized semester-by-semester schedules respecting prerequisites, distribution requirements, and workload balance.",
     ACCENT_GREEN),
]

for i, (title, desc, color) in enumerate(features1):
    x = Inches(0.8) + Inches(4.1) * i
    y = Inches(2.2)
    add_rounded_rect(slide, x, y, Inches(3.8), Inches(4.8), LIGHT_GRAY)
    add_rect(slide, x, y, Inches(3.8), Inches(0.06), color)

    add_circle(slide, x + Inches(1.5), y + Inches(0.4), Inches(0.7), color)
    icons = ["1", "2", "3"]
    add_text(slide, x + Inches(1.5), y + Inches(0.47), Inches(0.7), Inches(0.55),
             icons[i], size=24, color=WHITE, bold=True, align=PP_ALIGN.CENTER, font="Georgia")

    add_text(slide, x + Inches(0.3), y + Inches(1.4), Inches(3.2), Inches(0.5),
             title, size=18, color=NAVY, bold=True, font="Georgia", align=PP_ALIGN.CENTER)

    add_text(slide, x + Inches(0.3), y + Inches(2.1), Inches(3.2), Inches(2.5),
             desc, size=13, color=MEDIUM_GRAY, align=PP_ALIGN.CENTER)


# ============================================================
# SLIDE 5: KEY FEATURES (2 of 2)
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_rect(slide, Inches(0), Inches(0), Inches(0.08), H, DAVIDSON_RED)

add_text(slide, Inches(0.8), Inches(0.6), Inches(3), Inches(0.4),
         "KEY FEATURES", size=13, color=DAVIDSON_RED, bold=True)
add_text(slide, Inches(0.8), Inches(1.1), Inches(11), Inches(0.7),
         "Real data. Real people. Real outcomes.",
         size=38, color=NAVY, bold=True, font="Georgia")

features2 = [
    ("Professor Insights",
     "AI synthesizes RateMyProfessors reviews into balanced summaries with strengths, considerations, and a specific tip for success.",
     ACCENT_PURPLE),
    ("Alumni Network",
     "40+ curated Davidson alumni across McKinsey, Goldman Sachs, Google, Microsoft, and more. Browse by career field and graduation year.",
     ACCENT_AMBER),
    ("Cold Email Generator",
     "Solves networking anxiety. AI writes personalized, professional outreach emails tailored to each alumnus's role and your interests.",
     ACCENT_PINK),
]

for i, (title, desc, color) in enumerate(features2):
    x = Inches(0.8) + Inches(4.1) * i
    y = Inches(2.2)
    add_rounded_rect(slide, x, y, Inches(3.8), Inches(4.8), LIGHT_GRAY)
    add_rect(slide, x, y, Inches(3.8), Inches(0.06), color)

    add_circle(slide, x + Inches(1.5), y + Inches(0.4), Inches(0.7), color)
    icons = ["4", "5", "6"]
    add_text(slide, x + Inches(1.5), y + Inches(0.47), Inches(0.7), Inches(0.55),
             icons[i], size=24, color=WHITE, bold=True, align=PP_ALIGN.CENTER, font="Georgia")

    add_text(slide, x + Inches(0.3), y + Inches(1.4), Inches(3.2), Inches(0.5),
             title, size=18, color=NAVY, bold=True, font="Georgia", align=PP_ALIGN.CENTER)

    add_text(slide, x + Inches(0.3), y + Inches(2.1), Inches(3.2), Inches(2.5),
             desc, size=13, color=MEDIUM_GRAY, align=PP_ALIGN.CENTER)


# ============================================================
# SLIDE 6: TECH STACK
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, NAVY)
add_rect(slide, Inches(0), Inches(0), W, Inches(0.06), DAVIDSON_RED)

add_text(slide, Inches(0.8), Inches(0.5), Inches(3), Inches(0.4),
         "UNDER THE HOOD", size=13, color=DAVIDSON_RED, bold=True)
add_text(slide, Inches(0.8), Inches(1.0), Inches(11), Inches(0.7),
         "Built with a modern, production-grade stack.",
         size=36, color=WHITE, bold=True, font="Georgia")

stack = [
    ("Frontend", ACCENT_BLUE, [
        "Next.js 14 + TypeScript",
        "shadcn/ui + Tailwind CSS",
        "Framer Motion animations",
        "Recharts visualizations",
    ]),
    ("Backend", ACCENT_GREEN, [
        "Next.js API Routes (serverless)",
        "MongoDB Atlas + Mongoose",
        "NextAuth.js authentication",
        "bcrypt password hashing",
    ]),
    ("AI Engine", DAVIDSON_RED, [
        "Google Gemini 3 Flash",
        "Structured JSON outputs",
        "Smart caching (80% hit rate)",
        "6 distinct AI features",
    ]),
    ("Data Sources", ACCENT_PURPLE, [
        "Davidson College API (live)",
        "RateMyProfessors GraphQL",
        "463 courses indexed",
        "40+ alumni curated",
    ]),
]

for i, (title, color, items) in enumerate(stack):
    x = Inches(0.5) + Inches(3.2) * i
    y = Inches(2.2)
    add_rounded_rect(slide, x, y, Inches(2.95), Inches(4.0), SUBTLE_NAVY)
    add_rect(slide, x, y, Inches(2.95), Inches(0.06), color)

    add_text(slide, x + Inches(0.3), y + Inches(0.35), Inches(2.35), Inches(0.45),
             title, size=20, color=color, bold=True, font="Georgia")

    lines = [(item, 13, DIM_BLUE) for item in items]
    add_para_text(slide, x + Inches(0.3), y + Inches(1.1), Inches(2.35), Inches(2.5),
                  lines, font="Calibri")

add_text(slide, Inches(0.8), Inches(6.6), Inches(11.7), Inches(0.4),
         "Deployed on Vercel  |  MongoDB Atlas  |  Serverless, auto-scaling  |  <2s page loads",
         size=13, color=DIMMER_BLUE, align=PP_ALIGN.CENTER)


# ============================================================
# SLIDE 7: BY THE NUMBERS
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_rect(slide, Inches(0), Inches(0), Inches(0.08), H, DAVIDSON_RED)

add_text(slide, Inches(0.8), Inches(0.6), Inches(3), Inches(0.4),
         "BY THE NUMBERS", size=13, color=DAVIDSON_RED, bold=True)
add_text(slide, Inches(0.8), Inches(1.1), Inches(11), Inches(0.7),
         "Real data, real scale, real impact.",
         size=38, color=NAVY, bold=True, font="Georgia")

stats = [
    ("463", "Davidson courses fully indexed", ACCENT_BLUE),
    ("24", "Career paths mapped", DAVIDSON_RED),
    ("40+", "Alumni contacts curated", ACCENT_GREEN),
    ("6", "AI-powered features", ACCENT_PURPLE),
    ("128", "Credits tracked to graduation", ACCENT_AMBER),
    ("22", "API endpoints built", ACCENT_PINK),
]

for i, (number, label, color) in enumerate(stats):
    col = i % 3
    row = i // 3
    x = Inches(1.0) + Inches(3.9) * col
    y = Inches(2.3) + Inches(2.6) * row

    add_rounded_rect(slide, x, y, Inches(3.4), Inches(2.2), LIGHT_GRAY)

    add_text(slide, x, y + Inches(0.3), Inches(3.4), Inches(0.9),
             number, size=52, color=color, bold=True, align=PP_ALIGN.CENTER, font="Georgia")

    add_text(slide, x, y + Inches(1.35), Inches(3.4), Inches(0.5),
             label, size=15, color=MEDIUM_GRAY, align=PP_ALIGN.CENTER)


# ============================================================
# SLIDE 8: WHAT MAKES US DIFFERENT
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_rect(slide, Inches(0), Inches(0), Inches(0.08), H, DAVIDSON_RED)

add_text(slide, Inches(0.8), Inches(0.6), Inches(3), Inches(0.4),
         "WHY WE WIN", size=13, color=DAVIDSON_RED, bold=True)
add_text(slide, Inches(0.8), Inches(1.1), Inches(11), Inches(0.7),
         "This isn't another generic course planner.",
         size=38, color=NAVY, bold=True, font="Georgia")

diffs = [
    ("Backward-from-career planning",
     "Most tools ask \u201cwhat courses should I take?\u201d We ask \u201cwhat career do you want?\u201d and build backward."),
    ("Davidson-native depth",
     "463 real courses, real faculty, real alumni, live enrollment from Davidson\u2019s own API."),
    ("AI-synthesized professor reviews",
     "Our AI reads actual RMP reviews and creates balanced, actionable summaries with tips for success."),
    ("Career intelligence on every course",
     "Every course shows relevance: \u201cCSC 121 is 90% relevant to SWE, 45% to Data Science.\u201d"),
    ("Alumni network + cold email outreach",
     "We don\u2019t just show alumni\u2014we generate personalized outreach emails so students actually network."),
]

for i, (title, desc) in enumerate(diffs):
    y = Inches(2.2) + Inches(1.0) * i
    add_circle(slide, Inches(1.0), y + Inches(0.12), Inches(0.18), DAVIDSON_RED)
    add_text(slide, Inches(1.5), y, Inches(4), Inches(0.4),
             title, size=16, color=NAVY, bold=True, font="Georgia")
    add_text(slide, Inches(5.5), y, Inches(7), Inches(0.8),
             desc, size=14, color=MEDIUM_GRAY)


# ============================================================
# SLIDE 9: DEMO FLOW
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, NAVY)
add_rect(slide, Inches(0), Inches(0), W, Inches(0.06), DAVIDSON_RED)

add_text(slide, Inches(0.8), Inches(0.5), Inches(3), Inches(0.4),
         "DEMO WALKTHROUGH", size=13, color=DAVIDSON_RED, bold=True)
add_text(slide, Inches(0.8), Inches(1.0), Inches(11), Inches(0.7),
         "From sign-up to career roadmap in 60 seconds.",
         size=36, color=WHITE, bold=True, font="Georgia")

steps = [
    ("1", "Sign Up", "Create account, set\nmajor & interests", ACCENT_BLUE),
    ("2", "Explore Careers", "Browse 24 paths,\npick your target", DAVIDSON_RED),
    ("3", "Generate Plan", "AI builds courses,\npeople, activities", ACCENT_GREEN),
    ("4", "Build Schedule", "Drag & drop into\n4-year roadmap", ACCENT_PURPLE),
    ("5", "Network", "Find alumni, generate\ncold emails with AI", ACCENT_AMBER),
]

for i, (num, title, desc, color) in enumerate(steps):
    x = Inches(0.5) + Inches(2.55) * i
    y = Inches(2.2)
    add_rounded_rect(slide, x, y, Inches(2.3), Inches(3.8), SUBTLE_NAVY)

    add_circle(slide, x + Inches(0.8), y + Inches(0.35), Inches(0.7), color)
    add_text(slide, x + Inches(0.8), y + Inches(0.42), Inches(0.7), Inches(0.55),
             num, size=26, color=WHITE, bold=True, align=PP_ALIGN.CENTER, font="Georgia")

    add_text(slide, x + Inches(0.15), y + Inches(1.35), Inches(2.0), Inches(0.45),
             title, size=17, color=WHITE, bold=True, align=PP_ALIGN.CENTER, font="Georgia")

    # Use add_para_text for the two-line description
    desc_lines = [(line.strip(), 13, DIM_BLUE) for line in desc.split("\n")]
    add_para_text(slide, x + Inches(0.15), y + Inches(2.0), Inches(2.0), Inches(1.2),
                  desc_lines, align=PP_ALIGN.CENTER)

    if i < 4:
        add_text(slide, x + Inches(2.3), y + Inches(1.5), Inches(0.25), Inches(0.4),
                 "\u25B8", size=18, color=DIMMER_BLUE, align=PP_ALIGN.CENTER)

add_text(slide, Inches(1), Inches(6.5), Inches(11.3), Inches(0.4),
         "Live demo available \u2014 try it yourself at the booth!",
         size=14, color=DIMMER_BLUE, align=PP_ALIGN.CENTER)


# ============================================================
# SLIDE 10: WHAT'S NEXT
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_rect(slide, Inches(0), Inches(0), Inches(0.08), H, DAVIDSON_RED)

add_text(slide, Inches(0.8), Inches(0.6), Inches(3), Inches(0.4),
         "WHAT'S NEXT", size=13, color=DAVIDSON_RED, bold=True)
add_text(slide, Inches(0.8), Inches(1.1), Inches(11), Inches(0.7),
         "From Davidson prototype to institutional platform.",
         size=38, color=NAVY, bold=True, font="Georgia")

future = [
    ("NOW", "hack@DAVIDSON MVP",
     "463 courses, 24 career paths, 6 AI features, live enrollment sync, alumni network, cold email gen.",
     ACCENT_GREEN),
    ("NEXT", "Campus-Wide Launch",
     "Student beta testing, advisor integrations, mobile optimization, feedback loop with academic deans.",
     ACCENT_BLUE),
    ("FUTURE", "Multi-School Platform",
     "Adapt the engine for other liberal arts colleges. B2B licensing model for institutional career offices.",
     ACCENT_PURPLE),
]

for i, (phase, title, desc, color) in enumerate(future):
    x = Inches(0.8) + Inches(4.1) * i
    y = Inches(2.2)
    add_rounded_rect(slide, x, y, Inches(3.8), Inches(4.5), LIGHT_GRAY)
    add_rect(slide, x, y, Inches(3.8), Inches(0.06), color)

    add_rounded_rect(slide, x + Inches(0.3), y + Inches(0.4), Inches(1.3), Inches(0.45), color)
    add_text(slide, x + Inches(0.3), y + Inches(0.43), Inches(1.3), Inches(0.4),
             phase, size=13, color=WHITE, bold=True, align=PP_ALIGN.CENTER)

    add_text(slide, x + Inches(0.3), y + Inches(1.2), Inches(3.2), Inches(0.5),
             title, size=19, color=NAVY, bold=True, font="Georgia")

    add_text(slide, x + Inches(0.3), y + Inches(1.9), Inches(3.2), Inches(2.2),
             desc, size=14, color=MEDIUM_GRAY)


# ============================================================
# SLIDE 11: CLOSING
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, NAVY)
add_rect(slide, Inches(0), Inches(0), W, Inches(0.06), DAVIDSON_RED)
add_circle(slide, Inches(10.5), Inches(0.5), Inches(3), SUBTLE_NAVY)
add_circle(slide, Inches(-1), Inches(5), Inches(2.5), SUBTLE_NAVY)

icon = add_rounded_rect(slide, Inches(5.9), Inches(1.3), Inches(1.5), Inches(1.5), DAVIDSON_RED)
add_text(slide, Inches(5.9), Inches(1.45), Inches(1.5), Inches(1.2),
         "MIS", size=36, color=WHITE, bold=True, align=PP_ALIGN.CENTER, font="Georgia")

add_text(slide, Inches(1.5), Inches(3.2), Inches(10.3), Inches(1),
         "Your degree. Your career. One plan.",
         size=44, color=WHITE, bold=True, align=PP_ALIGN.CENTER, font="Georgia")

add_text(slide, Inches(2.5), Inches(4.4), Inches(8.3), Inches(0.7),
         "MakeItSo gives every Davidson student an AI career advisor\u2014free, personalized, and always available.",
         size=18, color=DIM_BLUE, align=PP_ALIGN.CENTER)

cta = add_rounded_rect(slide, Inches(5.1), Inches(5.4), Inches(3.1), Inches(0.65), DAVIDSON_RED)
add_text(slide, Inches(5.1), Inches(5.45), Inches(3.1), Inches(0.55),
         "Try the Live Demo", size=18, color=WHITE, bold=True, align=PP_ALIGN.CENTER)

add_text(slide, Inches(2), Inches(6.4), Inches(9.3), Inches(0.5),
         "hack@DAVIDSON 2025  |  Questions? Come talk to us!",
         size=14, color=DIMMER_BLUE, align=PP_ALIGN.CENTER)


# Save
output_path = "/home/user/MakeItSo/MakeItSo_Pitch_Deck.pptx"
prs.save(output_path)
print(f"Pitch deck saved to: {output_path}")
