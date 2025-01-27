import { useState } from 'react';
import '../css/CreateTestModal.css';

function CreateTestModal({ isOpen, onClose, onSubmit }) {
  const [testData, setTestData] = useState({
    title: '',
    description: '',
    min_triangle_size: 1.0,
    max_triangle_size: 5.0,
    min_saturation: 0.2,
    max_saturation: 0.8,
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
          <div className="form-group range-inputs">
            <label>Triangle Size Range:</label>
            <div className="range-container">
              <input
                type="number"
                step="0.1"
                value={testData.min_triangle_size}
                onChange={(e) => setTestData({...testData, min_triangle_size: parseFloat(e.target.value)})}
                required
              />
              <span>to</span>
              <input
                type="number"
                step="0.1"
                value={testData.max_triangle_size}
                onChange={(e) => setTestData({...testData, max_triangle_size: parseFloat(e.target.value)})}
                required
              />
            </div>
          </div>

          <div className="form-group range-inputs">
            <label>Saturation Range:</label>
            <div className="range-container">
              <input
                type="text"
                value={testData.min_saturation}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '' || (!isNaN(value) && parseFloat(value) >= 0 && parseFloat(value) <= 1)) {
                    setTestData({...testData, min_saturation: value === '' ? value : parseFloat(value)});
                  }
                }}
                required
              />
              <span>to</span>
              <input
                type="text"
                value={testData.max_saturation}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '' || (!isNaN(value) && parseFloat(value) >= 0 && parseFloat(value) <= 1)) {
                    setTestData({...testData, max_saturation: value === '' ? value : parseFloat(value)});
                  }
                }}
                required
              />
            </div>
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
