import csv
import random
import colorsys

# Initialize bounds
triangle_size_bounds = (50, 300)
saturation_bounds = (0.5, 1.0)
# Fixed values for other parameters
circle_diameter = 500
hue = 0
value = 1.0
duration = 1000
orientations = ["N", "S", "E", "W"]

# Initial rectangle (entire parameter space)
rectangles = [
    {
        "bounds": {
            "triangle_size": triangle_size_bounds,
            "saturation": saturation_bounds,
        },
        "area": 1.0,
        "samples": 0,
        "success_rate": 0.0,
    }
]


def selection_probability(rect):
    A = rect["area"]
    n = rect["samples"]
    s = rect["success_rate"]
    return (A / (n + 1)) * (1 - s)


def hsv_to_rgb(h, s, v):
    r, g, b = colorsys.hsv_to_rgb(h / 360, s, v)
    return int(r * 255), int(g * 255), int(b * 255)


def test_combination():
    # Placeholder for actual testing logic
    return random.choice([0, 1])


def split_rectangle(rect):
    bounds = rect["bounds"]
    midpoints = {k: (v[0] + v[1]) / 2 for k, v in bounds.items()}
    new_rects = []
    for i in range(2):
        for j in range(2):
            new_bounds = {
                "triangle_size": (
                    (bounds["triangle_size"][i], midpoints["triangle_size"])
                    if i == 0
                    else (midpoints["triangle_size"], bounds["triangle_size"][1])
                ),
                "saturation": (
                    (bounds["saturation"][j], midpoints["saturation"])
                    if j == 0
                    else (midpoints["saturation"], bounds["saturation"][1])
                ),
            }
            new_rects.append(
                {
                    "bounds": new_bounds,
                    "area": rect["area"] / 4,
                    "samples": 0,
                    "success_rate": 0.0,
                }
            )
    return new_rects


combinations = []
iterations = 100

for _ in range(iterations):
    probabilities = [selection_probability(r) for r in rectangles]
    total_prob = sum(probabilities)
    if total_prob == 0:
        break
    probabilities = [p / total_prob for p in probabilities]
    selected_rect = random.choices(rectangles, weights=probabilities, k=1)[0]
    bounds = selected_rect["bounds"]

    triangle_size = random.uniform(*bounds["triangle_size"])
    saturation = random.uniform(*bounds["saturation"])
    orientation = random.choice(orientations)

    triangle_rgb = hsv_to_rgb(hue, saturation, value)
    circle_rgb = hsv_to_rgb((hue + 180) % 360, saturation, value)
    success = test_combination()

    selected_rect["samples"] += 1
    selected_rect["success_rate"] = (
        (selected_rect["success_rate"] * (selected_rect["samples"] - 1)) + success
    ) / selected_rect["samples"]

    if selected_rect["success_rate"] < 0.75 and selected_rect["samples"] > 5:
        new_rects = split_rectangle(selected_rect)
        rectangles.remove(selected_rect)
        rectangles.extend(new_rects)

    combinations.append(
        {
            "TriangleSideLength": int(triangle_size),
            "CircleDiameter": circle_diameter,
            "TriangleRGB": f"{triangle_rgb[0]},{triangle_rgb[1]},{triangle_rgb[2]}",
            "CircleRGB": f"{circle_rgb[0]},{circle_rgb[1]},{circle_rgb[2]}",
            "duration": duration,
            "orientation": orientation,
        }
    )

with open("output.csv", "w", newline="") as csvfile:
    fieldnames = [
        "TriangleSideLength",
        "CircleDiameter",
        "TriangleRGB",
        "CircleRGB",
        "duration",
        "orientation",
    ]
    writer = csv.DictWriter(csvfile, fieldnames=fieldnames, delimiter=";")
    writer.writeheader()
    for combo in combinations:
        writer.writerow(combo)
