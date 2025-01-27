function TestForm({ onSubmit, defaultValues = {} }) {
  const standardValues = {
    name: "",
    description: "",
    triangleMin: 10,
    triangleMax: 200,
    saturationMin: 0.05,
    saturationMax: 0.3,
    ...defaultValues, // This allows passed values to override standards
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    // Convert string values to numbers for numeric fields
    const processedData = {
      ...data,
      triangleMin: Number(data.triangleMin),
      triangleMax: Number(data.triangleMax),
      saturationMin: Number(data.saturationMin),
      saturationMax: Number(data.saturationMax),
    };

    onSubmit(processedData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="name" className="form-label">
          Name
        </label>
        <input
          id="name"
          name="name"
          className="form-input"
          defaultValue={standardValues.name}
          placeholder="Vision Test Name"
          required
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="description" className="form-label">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          className="form-textarea"
          defaultValue={standardValues.description}
          placeholder="Test description..."
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="form-label">Triangle Bounds</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="triangleMin" className="sr-only">
                Minimum
              </label>
              <input
                id="triangleMin"
                name="triangleMin"
                type="number"
                className="form-input"
                placeholder="Min"
                defaultValue={standardValues.triangleMin}
                required
              />
            </div>
            <div>
              <label htmlFor="triangleMax" className="sr-only">
                Maximum
              </label>
              <input
                id="triangleMax"
                name="triangleMax"
                type="number"
                className="form-input"
                placeholder="Max"
                defaultValue={standardValues.triangleMax}
                required
              />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <label className="form-label">Saturation Bounds</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="saturationMin" className="sr-only">
                Minimum
              </label>
              <input
                id="saturationMin"
                name="saturationMin"
                type="number"
                step="0.01"
                className="form-input"
                placeholder="Min"
                defaultValue={standardValues.saturationMin}
                required
              />
            </div>
            <div>
              <label htmlFor="saturationMax" className="sr-only">
                Maximum
              </label>
              <input
                id="saturationMax"
                name="saturationMax"
                type="number"
                step="0.01"
                className="form-input"
                placeholder="Max"
                defaultValue={standardValues.saturationMax}
                required
              />
            </div>
          </div>
        </div>
      </div>
      <button type="submit" className="btn btn-primary w-full">
        Save Test
      </button>
    </form>
  );
}

export default TestForm;
