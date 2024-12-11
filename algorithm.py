import random
import colorsys
import seaborn as sns
import pandas as pd
import matplotlib.pyplot as plt  # This import is only needed internally by seaborn for plotting; we won't call mpl directly.
from tqdm import tqdm  # Add TQDM for progress bar

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
        "true_samples": 0,
        "false_samples": 0,
    }
]


def selection_probability(rect):
    A = rect["area"]
    n = rect["true_samples"] + rect["false_samples"]
    s = rect["true_samples"] / (n + 1)  # Add 1 to avoid division by zero
    return (A / (n + 1)) * (1 - s)


def hsv_to_rgb(h, s, v):
    r, g, b = colorsys.hsv_to_rgb(h / 360, s, v)
    return int(r * 255), int(g * 255), int(b * 255)


def test_combination(triangle_size, saturation, orientation):
    """Test a single combination once and return True/False for success/failure"""
    # Placeholder test using random choice
    return bool(random.getrandbits(1))


def split_rectangle(rect):
    bounds = rect["bounds"]
    midpoints = {k: (v[0] + v[1]) / 2 for k, v in bounds.items()}
    new_rects = []
    # Split into 4 sub-rectangles
    for i in range(2):
        for j in range(2):
            new_bounds = {
                "triangle_size": (
                    (bounds["triangle_size"][0], midpoints["triangle_size"])
                    if i == 0
                    else (midpoints["triangle_size"], bounds["triangle_size"][1])
                ),
                "saturation": (
                    (bounds["saturation"][0], midpoints["saturation"])
                    if j == 0
                    else (midpoints["saturation"], bounds["saturation"][1])
                ),
            }
            new_rects.append(
                {
                    "bounds": new_bounds,
                    "area": rect["area"] / 4,
                    "true_samples": 0,
                    "false_samples": 0,
                }
            )
    return new_rects


combinations = []
iterations = 200

# Add TQDM progress bar
for _ in tqdm(range(iterations)):
    probabilities = [selection_probability(r) for r in rectangles]
    total_prob = sum(probabilities)
    if total_prob == 0:
        break
    probabilities = [p / total_prob for p in probabilities]
    selected_rect = random.choices(rectangles, weights=probabilities, k=1)[0]
    bounds = selected_rect["bounds"]

    # Generate a single combination
    triangle_size = random.uniform(*bounds["triangle_size"])
    saturation = random.uniform(*bounds["saturation"])
    orientation = random.choice(orientations)

    triangle_rgb = hsv_to_rgb(hue, saturation, value)
    circle_rgb = hsv_to_rgb((hue + 180) % 360, saturation, value)

    # Test this specific combination once
    success = test_combination(triangle_size, saturation, orientation)

    # Update rectangle stats
    if success:
        selected_rect["true_samples"] += 1
    else:
        selected_rect["false_samples"] += 1

    total_samples = selected_rect["true_samples"] + selected_rect["false_samples"]
    success_rate = (
        selected_rect["true_samples"] / total_samples if total_samples > 0 else 0
    )

    # If success rate is low after a few samples, subdivide the rectangle
    if success_rate < 0.75 and total_samples > 5:
        new_rects = split_rectangle(selected_rect)
        rectangles.remove(selected_rect)
        rectangles.extend(new_rects)

    combinations.append(
        {
            "triangle_size": triangle_size,
            "saturation": saturation,
            "orientation": orientation,
            "success": success,
        }
    )

# Convert to DataFrame for plotting
df = pd.DataFrame(combinations)

# Create the plot
plt.figure(figsize=(10, 8))

# Plot the scatter points first
sns.scatterplot(
    data=df,
    x="triangle_size",
    y="saturation",
    hue="success",
    palette={True: "green", False: "red"},
    alpha=0.7,
)

# Add rectangle boundaries
for rect in rectangles:
    bounds = rect["bounds"]
    x_min, x_max = bounds["triangle_size"]
    y_min, y_max = bounds["saturation"]

    # Vertical lines
    plt.vlines(
        x=x_min, ymin=y_min, ymax=y_max, colors="blue", alpha=0.3, linestyles="--"
    )
    plt.vlines(
        x=x_max, ymin=y_min, ymax=y_max, colors="blue", alpha=0.3, linestyles="--"
    )

    # Horizontal lines
    plt.hlines(
        y=y_min, xmin=x_min, xmax=x_max, colors="blue", alpha=0.3, linestyles="--"
    )
    plt.hlines(
        y=y_max, xmin=x_min, xmax=x_max, colors="blue", alpha=0.3, linestyles="--"
    )

plt.xlabel("Triangle Size")
plt.ylabel("Saturation")
plt.title("Parameter Space Exploration")
plt.show()
