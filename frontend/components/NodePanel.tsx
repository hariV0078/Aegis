"use client";

interface NodePanelProps {
  nodeId: string;
  nodeLabel: string;
  toolType: string;
  params: Record<string, unknown>;
  onUpdateParams: (params: Record<string, unknown>) => void;
  onDelete: () => void;
}

const PARAM_SCHEMAS: Record<string, { label: string; type: string; required?: boolean }[]> = {
  web_search: [
    { label: "Search Query", type: "text", required: true },
    { label: "Max Results", type: "number" },
  ],
  http_call: [
    { label: "URL", type: "text", required: true },
    { label: "Method", type: "select-GET-POST-PUT-DELETE" },
    { label: "Headers (JSON)", type: "textarea" },
    { label: "Body (JSON)", type: "textarea" },
  ],
  email_send: [
    { label: "To", type: "text", required: true },
    { label: "Subject", type: "text", required: true },
    { label: "Body", type: "textarea", required: true },
  ],
  database_query: [
    { label: "Connection String", type: "text", required: true },
    { label: "Query", type: "textarea", required: true },
  ],
  llm_call: [
    { label: "Prompt", type: "textarea", required: true },
    { label: "Model", type: "text" },
    { label: "Temperature", type: "number" },
  ],
};

export function NodePanel({
  nodeId,
  nodeLabel,
  toolType,
  params,
  onUpdateParams,
  onDelete,
}: NodePanelProps) {
  const schema = PARAM_SCHEMAS[toolType] || [];

  const handleParamChange = (key: string, value: unknown) => {
    onUpdateParams({ ...params, [key]: value });
  };

  return (
    <div className="node-panel">
      <div className="node-panel__header">
        <h3>{nodeLabel}</h3>
        <button onClick={onDelete} className="btn btn--danger btn--small">
          Delete
        </button>
      </div>

      <div className="node-panel__content">
        {schema.length === 0 ? (
          <p className="text-muted">No parameters for this tool.</p>
        ) : (
          schema.map((field) => {
            const fieldKey = field.label.toLowerCase().replace(/\s+/g, "_");
            const value = params[fieldKey] || "";

            if (field.type.startsWith("select-")) {
              const options = field.type.split("-").slice(1);
              return (
                <div key={fieldKey} className="form-group">
                  <label>{field.label}</label>
                  <select
                    value={value as string}
                    onChange={(e) => handleParamChange(fieldKey, e.target.value)}
                    className="form-control"
                  >
                    <option value="">-- Choose --</option>
                    {options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }

            if (field.type === "textarea") {
              return (
                <div key={fieldKey} className="form-group">
                  <label>
                    {field.label}
                    {field.required && <span className="text-required">*</span>}
                  </label>
                  <textarea
                    value={value as string}
                    onChange={(e) => handleParamChange(fieldKey, e.target.value)}
                    className="form-control"
                    rows={3}
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                  />
                </div>
              );
            }

            return (
              <div key={fieldKey} className="form-group">
                <label>
                  {field.label}
                  {field.required && <span className="text-required">*</span>}
                </label>
                <input
                  type={field.type}
                  value={value as string}
                  onChange={(e) => handleParamChange(fieldKey, e.target.value)}
                  className="form-control"
                  placeholder={`Enter ${field.label.toLowerCase()}`}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
