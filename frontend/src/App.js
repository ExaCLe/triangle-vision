import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import TestCard from "./components/TestCard";
import TestFormModal from "./components/TestFormModal";
import CustomTest from "./components/CustomTest";
import PlayTest from "./components/PlayTest";
import TestVisualization from "./components/TestVisualization";
import StartRunModal from "./components/StartRunModal";
import SettingsPage from "./components/SettingsPage";
import DeleteConfirmModal from "./components/DeleteConfirmModal";
import Toast from "./components/Toast";
import "./css/App.css";
import Navbar from "./components/Navbar";
import { ThemeProvider } from "./context/ThemeContext";

function App() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [selectedTest, setSelectedTest] = useState(null);
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [runModalTest, setRunModalTest] = useState(null);
  const [testPendingDelete, setTestPendingDelete] = useState(null);
  const [isDeletingTest, setIsDeletingTest] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => {
      setToast(null);
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const refetchTests = async () => {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:8000/api/tests/");
      if (!response.ok) {
        throw new Error("Failed to fetch tests");
      }
      const data = await response.json();
      setTests(data);
    } catch (err) {
      setError("Failed to load tests");
      console.error("Error loading tests:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refetchTests();
  }, []);

  const handleTestSubmit = async (testData, testId = null) => {
    try {
      const url = testId
        ? `http://localhost:8000/api/tests/${testId}`
        : "http://localhost:8000/api/tests/";

      console.log(testData);
      const response = await fetch(url, {
        method: testId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(testData),
      });

      if (!response.ok) {
        throw new Error(`Failed to ${testId ? "modify" : "create"} test`);
      }

      await refetchTests();
      setIsTestModalOpen(false);
      setSelectedTest(null);
    } catch (error) {
      console.error(`Error ${testId ? "modifying" : "creating"} test:`, error);
      alert(
        `Failed to ${testId ? "modify" : "create"} test. Please try again.`
      );
    }
  };

  const showToast = (message, type = "info") => {
    setToast({ message, type, createdAt: Date.now() });
  };

  const handleDeleteTest = async () => {
    if (!testPendingDelete) return;

    const { id, title } = testPendingDelete;
    setIsDeletingTest(true);
    try {
      const response = await fetch(
        `http://localhost:8000/api/tests/${id}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        let errorDetail = `status ${response.status}`;
        const errorBody = await response.text();
        if (errorBody) {
          try {
            const payload = JSON.parse(errorBody);
            if (payload?.detail) {
              errorDetail = `${response.status}: ${payload.detail}`;
            } else {
              errorDetail = `${response.status}: ${errorBody}`;
            }
          } catch (_) {
            errorDetail = `${response.status}: ${errorBody}`;
          }
        }
        throw new Error(`Failed to delete test (${errorDetail})`);
      }

      await refetchTests();
      setTestPendingDelete(null);
      showToast(`Deleted "${title}"`, "success");
    } catch (error) {
      console.error("Error deleting test:", error);
      showToast(`Could not delete "${title}"`, "error");
    } finally {
      setIsDeletingTest(false);
    }
  };

  const handleEditTest = (test) => {
    setSelectedTest(test);
    setModalMode("modify");
    setIsTestModalOpen(true);
  };

  const handlePlayTest = (test) => {
    setRunModalTest(test);
    setIsRunModalOpen(true);
  };

  const handleRunCreated = (run) => {
    if (
      !run ||
      run.pretest_size_min === null ||
      run.pretest_size_max === null ||
      run.pretest_saturation_min === null ||
      run.pretest_saturation_max === null
    ) {
      return;
    }

    setTests((previousTests) =>
      previousTests.map((existingTest) =>
        existingTest.id === run.test_id
          ? {
              ...existingTest,
              min_triangle_size: run.pretest_size_min,
              max_triangle_size: run.pretest_size_max,
              min_saturation: run.pretest_saturation_min,
              max_saturation: run.pretest_saturation_max,
            }
          : existingTest
      )
    );
  };

  return (
    <ThemeProvider>
      <Router>
        <div className="app">
          <Navbar
            onCreateClick={() => {
              setSelectedTest(null);
              setModalMode("create");
              setIsTestModalOpen(true);
            }}
          />
          <Routes>
            <Route
              path="/"
              element={
                <main className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3rem' }}>
                  <div className="home-header">
                    <h1 className="page-title">Your Tests</h1>
                    <p className="page-subtitle">{tests.length} test{tests.length !== 1 ? 's' : ''} configured</p>
                  </div>
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {loading ? (
                      <div className="loading-state">Loading</div>
                    ) : error ? (
                      <p className="error-message">{error}</p>
                    ) : tests.length === 0 ? (
                      <div className="empty-state">
                        <p>No tests yet</p>
                        <span className="empty-hint">Create your first test to get started</span>
                      </div>
                    ) : (
                      tests.map((test) => (
                        <TestCard
                          key={test.id}
                          test={test}
                          onEdit={handleEditTest}
                          onDelete={setTestPendingDelete}
                          onPlay={handlePlayTest}
                        />
                      ))
                    )}
                  </div>
                </main>
              }
            />
            <Route path="/custom-test" element={<CustomTest />} />
            <Route path="/play-test/:testId" element={<PlayTest />} />
            <Route path="/play-test/:testId/run/:runId" element={<PlayTest />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route
              path="/test-visualization/:testId"
              element={<TestVisualization />}
            />
          </Routes>
          <TestFormModal
            isOpen={isTestModalOpen}
            onClose={() => {
              setIsTestModalOpen(false);
              setSelectedTest(null);
            }}
            onSubmit={(data) => handleTestSubmit(data, selectedTest?.id)}
            mode={modalMode}
            defaultValues={selectedTest}
          />
          <StartRunModal
            isOpen={isRunModalOpen}
            onClose={() => {
              setIsRunModalOpen(false);
              setRunModalTest(null);
            }}
            test={runModalTest}
            onRunCreated={handleRunCreated}
          />
          <DeleteConfirmModal
            isOpen={Boolean(testPendingDelete)}
            test={testPendingDelete}
            isDeleting={isDeletingTest}
            onCancel={() => {
              if (!isDeletingTest) {
                setTestPendingDelete(null);
              }
            }}
            onConfirm={handleDeleteTest}
          />
          <Toast toast={toast} onDismiss={() => setToast(null)} />
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;
