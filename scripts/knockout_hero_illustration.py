"""One-off: edge-flood hero PNG to alpha (removes white/cream matting)."""
from knockout_plan_character_bg import knockout_edge_background

if __name__ == "__main__":
    knockout_edge_background("public/images/hero-remoed-illustration.png", tol=52)
    print("ok public/images/hero-remoed-illustration.png")
