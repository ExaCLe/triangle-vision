import { useState } from 'react';
import '../css/CreateTestModal.css';

function CreateTestModal({ isOpen, onClose, onSubmit }) {
  const [testData, setTestData] = useState({
    title: '',
    description: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onSubmit(testData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Create New Test</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name:</label>
            <input
              type="text"
              value={testData.title}
              onChange={(e) => setTestData({...testData, title: e.target.value})}
              required
            />
          </div>
          <div className="form-group">
            <label>Description:</label>
            <textarea
              value={testData.description}
              onChange={(e) => setTestData({...testData, description: e.target.value})}
              required
            />
          </div>
          <div className="modal-buttons">
            <button type="submit">Create</button>
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateTestModal;
