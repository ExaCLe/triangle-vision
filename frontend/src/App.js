import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import CustomTest from './components/CustomTest';
import Navbar from './components/Navbar';
import TestCard from './components/TestCard';
import './css/App.css';

function App() {
  // Temporary mock data for tests
  const tests = [
    {
      id: 1,
      name: "Basic Triangle Test",
      description: "A simple test to measure reaction time to triangle orientations.",
    },
    {
      id: 2,
      name: "Advanced Pattern Recognition",
      description: "Complex patterns with varying sizes and colors.",
    }
  ];

  return (
    <Router>
      <div className="app">
        <Navbar />
        <Routes>
          <Route path="/" element={
            <div className="home-container">
              <h1>Triangle Vision Tests</h1>
              <div className="tests-grid">
                {tests.map(test => (
                  <TestCard key={test.id} test={test} />
                ))}
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
