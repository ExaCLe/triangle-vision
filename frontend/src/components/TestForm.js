function TestForm({ onSubmit, defaultValues = {} }) {
  const standardValues = {
    title: "",
    description: "",
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
      <button type="submit" className="btn btn-primary w-full">
        Save Test
      </button>
    </form>
  );
}

export default TestForm;
