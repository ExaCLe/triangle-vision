import { useState, useEffect } from 'react';
import '../css/Modal.css';

function ModifyTestModal({ isOpen, onClose, onRefetch }) {
  const [tests, setTests] = useState([]);
  const [selectedTest, setSelectedTest] = useState(null);
  const [modifiedData, setModifiedData] = useState({ title: '', description: '' });

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

  const handleModify = async (e) => {
    e.preventDefault();
    if (!selectedTest) return;

    try {
      const response = await fetch(`http://localhost:8000/tests/${selectedTest.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(modifiedData)
      });

      if (response.ok) {
        await onRefetch();
        onClose();
      }
    } catch (error) {
      console.error('Error modifying test:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Modify Test</h2>
        <div className="test-list">
          {tests.map(test => (
            <div 
              key={test.id} 
              className={`test-item ${selectedTest?.id === test.id ? 'selected' : ''}`}
              onClick={() => {
                setSelectedTest(test);
                setModifiedData({ title: test.title, description: test.description });
              }}
            >
              {test.title}
            </div>
          ))}
        </div>
        {selectedTest && (
          <form onSubmit={handleModify}>
            <div className="form-group">
              <label>Title:</label>
              <input
                type="text"
                value={modifiedData.title}
                onChange={(e) => setModifiedData({...modifiedData, title: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label>Description:</label>
              <textarea
                value={modifiedData.description}
                onChange={(e) => setModifiedData({...modifiedData, description: e.target.value})}
              />
            </div>
            <div className="modal-buttons">
              <button type="submit">Save Changes</button>
              <button type="button" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default ModifyTestModal;
