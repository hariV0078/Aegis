from __future__ import annotations

# Hardcoded 3-node medical billing anomaly detector workflow
# This is the hackathon demo that proves token_map integrity

MEDICAL_BILLING_DETECTOR = {
    "id": "medical-billing-detector",
    "name": "Medical Billing Anomaly Detector",
    "description": "Detects billing anomalies in medical records while preserving patient privacy through multi-node workflow execution.",
    "nodes": [
        {
            "id": "ingest_and_classify",
            "type": "tool",
            "tool_name": "web_search",
            "params": {
                "query": "typical medical billing costs by procedure category outpatient inpatient surgery",
                "num_results": 3,
            },
        },
        {
            "id": "analyze_anomalies",
            "type": "tool",
            "tool_name": "http_call",
            "params": {
                "url": "http://localhost:8001/analyze",
                "method": "POST",
            },
        },
        {
            "id": "generate_alert",
            "type": "tool",
            "tool_name": "email_send",
            "params": {
                "to": "billing-audit@hospital.local",
                "subject": "Billing Anomalies Detected",
                "body": "Review the flagged anomalies in your secure portal.",
            },
        },
    ],
}


def get_demo_workflow(workflow_id: str = "medical-billing-detector") -> dict | None:
    """Retrieve a demo workflow by ID."""
    workflows = {
        "medical-billing-detector": MEDICAL_BILLING_DETECTOR,
    }
    return workflows.get(workflow_id)


def list_demo_workflows() -> list[dict]:
    """List all available demo workflows."""
    return [
        {
            "id": MEDICAL_BILLING_DETECTOR["id"],
            "name": MEDICAL_BILLING_DETECTOR["name"],
            "description": MEDICAL_BILLING_DETECTOR["description"],
            "node_count": len(MEDICAL_BILLING_DETECTOR["nodes"]),
        },
    ]
