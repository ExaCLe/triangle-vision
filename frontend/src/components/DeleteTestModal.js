import { useState, useEffect } from 'react';
import '../css/Modal.css';

function DeleteTestModal({ isOpen, onClose, onRefetch }) {
  const [tests, setTests] = useState([]);

  useEffect(() => {
    if (isOpen) {
      fetchTests();
    }
  }, [isOpen]);

  const fetchTests = async () => {
    try {
      const response = await fetch('http://localhost:8000/tests/');
      const data = await response.json();
      setTests(data);
    } catch (error) {
      console.error('Error fetching tests:', error);
    }
  };

  const handleDelete = async (testId) => {
    try {
      const response = await fetch(`http://localhost:8000/tests/${testId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await onRefetch();
        setTests(tests.filter(test => test.id !== testId));
      }
    } catch (error) {
      console.error('Error deleting test:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Delete Test</h2>
        <div className="test-list">
          {tests.map(test => (
            <div key={test.id} className="test-item">
              <span>{test.title}</span>
              <button 
                className="delete-btn"
                onClick={() => handleDelete(test.id)}
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
        <div className="modal-buttons">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default DeleteTestModal;
