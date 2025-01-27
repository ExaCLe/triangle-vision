import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import CustomTest from "./components/CustomTest";
import TestCard from "./components/TestCard";
import PlayTest from "./components/PlayTest";
import TestVisualization from "./components/TestVisualization";
import TestFormModal from "./components/TestFormModal";
import "./css/App.css";
import Navbar from "./components/Navbar";

function App() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");

  const refetchTests = async () => {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:8000/tests/");
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
        ? `http://localhost:8000/tests/${testId}`
        : "http://localhost:8000/tests/";

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
    } catch (error) {
      console.error(`Error ${testId ? "modifying" : "creating"} test:`, error);
    }
  };

  return (
    <Router>
      <div className="app">
        <Navbar onCreateClick={() => setIsTestModalOpen(true)} />
        <main className="container py-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              <p>Loading tests...</p>
            ) : error ? (
              <p className="error-message">{error}</p>
            ) : tests.length === 0 ? (
              <p>No tests available</p>
            ) : (
              tests.map((test) => <TestCard key={test.id} test={test} />)
            )}
          </div>
        </main>
        <TestFormModal
          isOpen={isTestModalOpen}
          onClose={() => setIsTestModalOpen(false)}
          onSubmit={handleTestSubmit}
          mode="create"
        />
      </div>
    </Router>
  );
}

export default App;
