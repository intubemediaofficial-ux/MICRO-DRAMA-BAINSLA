"""Render the demo catalogue artwork set (posters, thumbnails, banners, cast avatars)."""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from poster_gen import avatar, banner, poster, thumb  # noqa: E402

SERIES = [
    {
        "slug": "second-chance-cafe",
        "title": "Second Chance Cafe",
        "genre": "Sweet Romance",
        "palette": "warm",
        "photo": "cafe_c",
        "seed": 11,
        "cast": [("Aanya Kapoor", "Meera"), ("Rohan Malhotra", "Kabir"),
                 ("Sneha Iyer", "Tara")],
    },
    {
        "slug": "room-404",
        "title": "Room 404",
        "genre": "Revenge Thriller",
        "palette": "night",
        "photo": "hotel_a",
        "seed": 27,
        "cast": [("Ishaan Verma", "Detective Rane"), ("Nikita Rao", "Alisha"),
                 ("Arjun Sethi", "Mr. Khanna")],
    },
    {
        "slug": "crimson-promises",
        "title": "Crimson Promises",
        "genre": "Billionaire Boss",
        "palette": "crimson",
        "photo": "office_a",
        "seed": 5,
        "cast": [("Vivaan Chauhan", "Aditya Rathore"), ("Myra Sen", "Naina"),
                 ("Kabir Joshi", "Dev")],
    },
    {
        "slug": "contract-marriage",
        "title": "Contract Marriage",
        "genre": "Arranged Marriage",
        "palette": "gold",
        "photo": "flowers_a",
        "seed": 41,
        "cast": [("Diya Nair", "Rhea"), ("Aryan Bhatt", "Veer"),
                 ("Leela Menon", "Dadi")],
    },
    {
        "slug": "midnight-metro",
        "title": "Midnight Metro",
        "genre": "Urban Mystery",
        "palette": "night",
        "photo": "city_a",
        "seed": 63,
        "cast": [("Zoya Khan", "Inspector Zoya"), ("Samar Dutt", "Nikhil"),
                 ("Reva Pillai", "Anchor Reva")],
    },
    {
        "slug": "rain-never-lies",
        "title": "Rain Never Lies",
        "genre": "Slow-burn Romance",
        "palette": "emerald",
        "photo": "rain_a",
        "seed": 77,
        "cast": [("Aarohi Desai", "Saira"), ("Neel Kulkarni", "Ranveer"),
                 ("Tanya Bose", "Ira")],
    },
    {
        "slug": "the-last-monsoon",
        "title": "The Last Monsoon",
        "genre": "Family Drama",
        "palette": "warm",
        "photo": "umbrella_a",
        "seed": 88,
        "cast": [("Gauri Shinde", "Amma"), ("Rudra Pratap", "Shekhar"),
                 ("Pia Grewal", "Nandini")],
    },
    {
        "slug": "heiress-in-hiding",
        "title": "Heiress in Hiding",
        "genre": "Secret Identity",
        "palette": "crimson",
        "photo": "neon_b",
        "seed": 96,
        "cast": [("Ira Ahluwalia", "Simran"), ("Yash Deora", "Karan"),
                 ("Bela Fernandes", "Aunt Bela")],
    },
    {
        "slug": "vow-of-ashes",
        "title": "Vow of Ashes",
        "genre": "Fantasy Revenge",
        "palette": "night",
        "photo": "neon_c",
        "seed": 102,
        "cast": [("Anvi Rathi", "Devika"), ("Om Shergill", "Raghav"),
                 ("Mira Lal", "The Oracle")],
    },
]

BANNERS = [
    ("banner-tonight", "Tonight on Bullet",
     "Three new vertical dramas - first 5 episodes free", "night", "city_b", 9),
    ("banner-double-coins", "Double Coins Weekend",
     "Recharge any bundle and get 2x coins - 48 hours only", "gold", "neon_a", 3),
    ("banner-trial", "3-Day Trial for Rs 9",
     "Unlock every VIP episode, cancel anytime", "crimson", "rain_b", 17),
]


def main(out_dir, bg_dir, episodes=60):
    manifest = []
    for s in SERIES:
        photo = f"{bg_dir}/{s['photo']}.jpg"
        poster(f"{out_dir}/posters/{s['slug']}.jpg", s["title"], s["genre"],
               episodes, s["palette"], s["seed"], photo=photo)
        thumb(f"{out_dir}/thumbs/{s['slug']}.jpg", s["title"].upper(),
              s["palette"], s["seed"] + 1, photo=photo)
        cast = []
        for i, (name, role) in enumerate(s["cast"]):
            rel = f"cast/{s['slug']}-{i + 1}.jpg"
            avatar(f"{out_dir}/{rel}", name, s["palette"], s["seed"] * 7 + i,
                   size=(320, 320))
            cast.append({"name": name, "role": role, "photoUrl": f"/demo/{rel}"})
        manifest.append({
            "slug": s["slug"], "title": s["title"], "genre": s["genre"],
            "posterUrl": f"/demo/posters/{s['slug']}.jpg",
            "thumbnailUrl": f"/demo/thumbs/{s['slug']}.jpg",
            "cast": cast,
        })
    for slug, title, subtitle, palette, photo, seed in BANNERS:
        banner(f"{out_dir}/banners/{slug}.jpg", title, subtitle, palette, seed,
               photo=f"{bg_dir}/{photo}.jpg")
    os.makedirs(out_dir, exist_ok=True)
    with open(f"{out_dir}/manifest.json", "w") as fh:
        json.dump(manifest, fh, indent=2)
    print(f"rendered {len(manifest)} series, {len(BANNERS)} banners into {out_dir}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/demo",
         sys.argv[2] if len(sys.argv) > 2 else "/tmp/bg2")
