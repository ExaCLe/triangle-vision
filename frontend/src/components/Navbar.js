import { Link } from 'react-router-dom';
import { useState } from 'react';
import '../css/Navbar.css';
import CreateTestModal from './CreateTestModal';
import ModifyTestModal from './ModifyTestModal';
import DeleteTestModal from './DeleteTestModal';

function Navbar({ onRefetch }) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isModifyModalOpen, setIsModifyModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

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

      await onRefetch();
      setIsCreateModalOpen(false);
      
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
          <div className="dropdown">
            <button 
              className="dropdown-btn"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              Change ▼
            </button>
            {isDropdownOpen && (
              <div className="dropdown-content">
                <button onClick={() => {
                  setIsModifyModalOpen(true);
                  setIsDropdownOpen(false);
                }}>
                  Modify Test
                </button>
                <button onClick={() => {
                  setIsDeleteModalOpen(true);
                  setIsDropdownOpen(false);
                }}>
                  Delete Test
                </button>
              </div>
            )}
          </div>
          <button 
            className="create-test-btn"
            onClick={() => setIsCreateModalOpen(true)}
          >
            Create New Test
          </button>
        </div>
      </nav>
      <CreateTestModal 
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateTest}
      />
      <ModifyTestModal
        isOpen={isModifyModalOpen}
        onClose={() => setIsModifyModalOpen(false)}
        onRefetch={onRefetch}
      />
      <DeleteTestModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onRefetch={onRefetch}
      />
    </>
  );
}

export default Navbar;
