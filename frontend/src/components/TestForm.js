function TestForm({ onSubmit, defaultValues = {} }) {
  const standardValues = {
    title: "",
    description: "",
    min_triangle_size: 10,
    max_triangle_size: 200,
    min_saturation: 0.05,
    max_saturation: 0.3,
    ...defaultValues, // This allows passed values to override standards
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    // Convert string values to numbers for numeric fields
    const processedData = {
      title: data.title,
      description: data.description,
      min_triangle_size: Number(data.min_triangle_size),
      max_triangle_size: Number(data.max_triangle_size),
      min_saturation: Number(data.min_saturation),
      max_saturation: Number(data.max_saturation),
    };

    onSubmit(processedData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="title" className="form-label">
          Name
        </label>
        <input
          id="title"
          name="title"
          className="form-input"
          defaultValue={standardValues.title}
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
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="form-label">Triangle Bounds</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="min_triangle_size" className="sr-only">
                Minimum
              </label>
              <input
                id="min_triangle_size"
                name="min_triangle_size"
                type="number"
                className="form-input"
                defaultValue={standardValues.min_triangle_size}
                required
              />
            </div>
            <div>
              <label htmlFor="max_triangle_size" className="sr-only">
                Maximum
              </label>
              <input
                id="max_triangle_size"
                name="max_triangle_size"
                type="number"
                className="form-input"
                defaultValue={standardValues.max_triangle_size}
                required
              />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <label className="form-label">Saturation Bounds</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="min_saturation" className="sr-only">
                Minimum
              </label>
              <input
                id="min_saturation"
                name="min_saturation"
                type="number"
                step="0.01"
                className="form-input"
                defaultValue={standardValues.min_saturation}
                required
              />
            </div>
            <div>
              <label htmlFor="max_saturation" className="sr-only">
                Maximum
              </label>
              <input
                id="max_saturation"
                name="max_saturation"
                type="number"
                step="0.01"
                className="form-input"
                defaultValue={standardValues.max_saturation}
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
