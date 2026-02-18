import { render, screen, waitFor } from "@testing-library/react";
import TestVisualization from "../components/TestVisualization";

const mockUseLocation = jest.fn();
const mockUseParams = jest.fn();

jest.mock(
  "react-router-dom",
  () => ({
    useLocation: () => mockUseLocation(),
    useParams: () => mockUseParams(),
  }),
  { virtual: true }
);

function jsonResponse(payload, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(payload),
  });
}

test("loads axis run analysis from run query param", async () => {
  mockUseParams.mockReturnValue({ testId: "12" });
  mockUseLocation.mockReturnValue({ search: "?runId=3" });
  global.fetch = jest.fn((url) => {
    if (url === "http://localhost:8000/api/runs/test/12") {
      return jsonResponse([
        { id: 2, name: "Adaptive", method: "adaptive_rectangles", status: "main" },
        { id: 3, name: "Axis", method: "axis_logistic", status: "axis" },
      ]);
    }
    if (url === "http://localhost:8000/api/runs/3/summary") {
      return jsonResponse({
        id: 3,
        name: "Axis",
        method: "axis_logistic",
        status: "axis",
        pretest_trial_count: 0,
        main_trials_count: 0,
        axis_trials_count: 8,
        total_trials_count: 8,
      });
    }
    if (url === "http://localhost:8000/api/runs/3/analysis?percent_step=5") {
      return jsonResponse({
        curves: {
          size: {
            x: [20, 60, 120],
            probability: [0.1, 0.5, 0.9],
            lower: [0.05, 0.4, 0.8],
            upper: [0.2, 0.6, 0.95],
            fixed_counterpart: { saturation: 1.0 },
          },
          saturation: {
            x: [0.1, 0.4, 0.8],
            probability: [0.05, 0.55, 0.95],
            lower: [0.02, 0.45, 0.9],
            upper: [0.1, 0.65, 0.98],
            fixed_counterpart: { triangle_size: 200.0 },
          },
        },
        threshold_table: {
          percent_step: 5,
          size: [{ percent: 50, value: 60 }],
          saturation: [{ percent: 50, value: 0.4 }],
        },
        warnings: [],
      });
    }
    return jsonResponse({ detail: "not found" }, false, 404);
  });

  render(<TestVisualization />);

  expect(await screen.findByText(/Run Analysis/i)).toBeInTheDocument();
  expect(await screen.findByText(/Size Axis Curve/i)).toBeInTheDocument();
  expect(await screen.findByText(/Saturation Axis Curve/i)).toBeInTheDocument();
  expect(await screen.findByText(/Threshold Table \(5% step\)/i)).toBeInTheDocument();
  expect(screen.getByText(/Method:/i)).toBeInTheDocument();

  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/runs/3/analysis?percent_step=5"
    )
  );
});

test("shows adaptive analysis surface for adaptive runs", async () => {
  mockUseParams.mockReturnValue({ testId: "12" });
  mockUseLocation.mockReturnValue({ search: "" });
  global.fetch = jest.fn((url) => {
    if (url === "http://localhost:8000/api/runs/test/12") {
      return jsonResponse([
        { id: 2, name: "Adaptive", method: "adaptive_rectangles", status: "main" },
      ]);
    }
    if (url === "http://localhost:8000/api/runs/2/summary") {
      return jsonResponse({
        id: 2,
        name: "Adaptive",
        method: "adaptive_rectangles",
        status: "main",
        pretest_trial_count: 6,
        main_trials_count: 10,
        axis_trials_count: 0,
        total_trials_count: 16,
      });
    }
    if (url === "http://localhost:8000/api/runs/2/analysis?percent_step=5") {
      return jsonResponse({
        analysis_type: "adaptive_surface",
        plot: {
          image: "dGVzdA==",
          plot_data: [{ triangle_size: 40, saturation: 0.5 }],
        },
        warnings: [],
      });
    }
    return jsonResponse({ detail: "not found" }, false, 404);
  });

  render(<TestVisualization />);

  expect(await screen.findByText(/Adaptive Surface/i)).toBeInTheDocument();
  const image = screen.getByAltText(/Run adaptive analysis/i);
  expect(image).toHaveAttribute("src", expect.stringContaining("data:image/png;base64"));
});
