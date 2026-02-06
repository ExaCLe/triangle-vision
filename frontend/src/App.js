import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import TestCard from "./components/TestCard";
import TestFormModal from "./components/TestFormModal";
import CustomTest from "./components/CustomTest";
import PlayTest from "./components/PlayTest";
import TestVisualization from "./components/TestVisualization";
import StartRunModal from "./components/StartRunModal";
import SettingsPage from "./components/SettingsPage";
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

  const handleDeleteTest = async (testId) => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/tests/${testId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to delete test");
      }

      await refetchTests();
    } catch (error) {
      console.error("Error deleting test:", error);
      alert("Failed to delete test. Please try again.");
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
                <main className="container py-6">
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {loading ? (
                      <p>Loading tests...</p>
                    ) : error ? (
                      <p className="error-message">{error}</p>
                    ) : tests.length === 0 ? (
                      <p>No tests available</p>
                    ) : (
                      tests.map((test) => (
                        <TestCard
                          key={test.id}
                          test={test}
                          onEdit={handleEditTest}
                          onDelete={handleDeleteTest}
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
          />
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;
