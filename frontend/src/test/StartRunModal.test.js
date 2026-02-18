import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import StartRunModal from "../components/StartRunModal";

const mockNavigate = jest.fn();

jest.mock(
  "react-router-dom",
  () => ({
    useNavigate: () => mockNavigate,
  }),
  { virtual: true }
);

const TEST = {
  id: 1,
  title: "Vision Test",
  min_triangle_size: null,
  max_triangle_size: null,
  min_saturation: null,
  max_saturation: null,
};

function jsonResponse(payload, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(payload),
  });
}

function mockFetch({ runs = [] } = {}) {
  global.fetch = jest.fn((url, options = {}) => {
    if (url === "http://localhost:8000/api/tests/") {
      return jsonResponse([TEST]);
    }
    if (url === "http://localhost:8000/api/settings/pretest") {
      return jsonResponse({
        global_limits: {
          min_triangle_size: 10,
          max_triangle_size: 200,
          min_saturation: 0.1,
          max_saturation: 1.0,
        },
      });
    }
    if (url === "http://localhost:8000/api/runs/test/1") {
      return jsonResponse(runs);
    }
    if (url === "http://localhost:8000/api/runs/" && options.method === "POST") {
      return jsonResponse({ id: 99, test_id: 1, method: "adaptive_rectangles" });
    }
    return jsonResponse({ detail: "not found" }, false, 404);
  });
}

function renderModal() {
  return render(
    <StartRunModal
      isOpen={true}
      onClose={jest.fn()}
      test={TEST}
      onRunCreated={jest.fn()}
    />
  );
}

beforeEach(() => {
  mockNavigate.mockReset();
});

test("shows continue/create split and method-specific fields", async () => {
  mockFetch({ runs: [{ id: 7, name: "Run A", method: "axis_logistic", status: "axis" }] });
  renderModal();

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("http://localhost:8000/api/runs/test/1"));
  expect(await screen.findByText(/Run Setup: Vision Test/)).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /Continue Existing Run/i })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /Create New Run/i })).toBeInTheDocument();
  expect(screen.getByText("Adaptive Setup")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("radio", { name: /Axis Logistic/i }));
  await waitFor(() =>
    expect(screen.getByText("Axis Switch Policy")).toBeInTheDocument()
  );
  expect(screen.queryByText("Adaptive Setup")).not.toBeInTheDocument();
});

test("continue existing run navigates without creating a run", async () => {
  mockFetch({ runs: [{ id: 5, name: "Continue me", method: "axis_isotonic", status: "axis" }] });
  renderModal();

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("http://localhost:8000/api/runs/test/1"));
  fireEvent.click(screen.getByRole("radio", { name: /Continue Existing Run/i }));
  await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /Continue Run/i }));

  expect(mockNavigate).toHaveBeenCalledWith("/play-test/1/run/5");
  const postCalls = global.fetch.mock.calls.filter(
    ([, options]) => options?.method === "POST"
  );
  expect(postCalls).toHaveLength(0);
});

test("create flow requires run name", async () => {
  mockFetch({ runs: [] });
  renderModal();

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("http://localhost:8000/api/runs/test/1"));
  expect(await screen.findByText(/Run Setup: Vision Test/)).toBeInTheDocument();
  const runNameInput = screen.getByPlaceholderText(/Enter unique run name/i);
  fireEvent.change(runNameInput, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: /Create Run/i }));

  expect(await screen.findByText(/Please enter a run name/i)).toBeInTheDocument();
  expect(mockNavigate).not.toHaveBeenCalled();
});
