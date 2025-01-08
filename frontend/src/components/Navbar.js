import { Link } from 'react-router-dom';
import { useState } from 'react';
import '../css/Navbar.css';
import CreateTestModal from './CreateTestModal';

function Navbar({ onTestCreated }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleCreateTest = async (testData) => {
    try {
      console.log(JSON.stringify(testData));
      const response = await fetch('http://localhost:8000/tests/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testData)
      });

      if (!response.ok) {
        throw new Error('Failed to create test');
      }

      const result = await response.json();
      console.log('Test created:', result);
      window.location.reload(); // Refresh the page to show new test
      
    } catch (error) {
      console.error('Error creating test:', error);
      // Handle error (show notification, etc.)
    }
  };

  return (
    <>
      <nav className="navbar">
        <Link to="/" className="nav-logo">
          Triangle Vision
        </Link>
        <div className="nav-links">
          <Link to="/" className="nav-link">Home</Link>
          <Link to="/custom-test" className="nav-link">Custom Test</Link>
          <button 
            className="create-test-btn"
            onClick={() => setIsModalOpen(true)}
          >
            Create New Test
          </button>
        </div>
      </nav>
      <CreateTestModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateTest}
      />
    </>
  );
}

export default Navbar;
