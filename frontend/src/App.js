import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import CustomTest from './components/CustomTest';
import Navbar from './components/Navbar';
import TestCard from './components/TestCard';
import './css/App.css';

function App() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetchTests = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/tests/');
      if (!response.ok) {
        throw new Error('Failed to fetch tests');
      }
      const data = await response.json();
      setTests(data);
    } catch (err) {
      setError('Failed to load tests');
      console.error('Error loading tests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refetchTests();
  }, []);

  return (
    <Router>
      <div className="app">
        <Navbar onRefetch={refetchTests} />
        <Routes>
          <Route path="/" element={
            <div className="home-container">
              <h1>Triangle Vision Tests</h1>
              <div className="tests-grid">
                {loading ? (
                  <p>Loading tests...</p>
                ) : error ? (
                  <p className="error-message">{error}</p>
                ) : tests.length === 0 ? (
                  <p>No tests available</p>
                ) : (
                  tests.map(test => (
                    <TestCard key={test.id} test={test} />
                  ))
                )}
              </div>
            </div>
          } />
          <Route path="/custom-test" element={<CustomTest />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
