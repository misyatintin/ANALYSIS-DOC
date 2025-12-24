"""FastAPI backend - Full Featured Document Analysis API"""
import json
import io
import os
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional, List

app = FastAPI(title="Document Analysis API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global flag for database status
db_initialized = False
db_error = None

@app.on_event("startup")
async def startup():
    global db_initialized, db_error
    try:
        import database
        database.init_database()
        db_initialized = True
        print("Database initialized successfully!")
    except Exception as e:
        db_error = str(e)
        print(f"Database initialization failed: {e}")

@app.get("/health")
async def health_check():
    return {
        "status": "ok" if db_initialized else "error",
        "db_initialized": db_initialized,
        "db_error": db_error,
        "env_vars": {
            "DB_HOST": os.getenv("DB_HOST", "not set"),
            "DB_PORT": os.getenv("DB_PORT", "not set"),
            "DB_NAME": os.getenv("DB_NAME", "not set"),
            "DB_USER": os.getenv("DB_USER", "not set")[:5] + "..." if os.getenv("DB_USER") else "not set",
            "PRODUCTION": os.getenv("PRODUCTION", "not set"),
        }
    }

# Import database module
try:
    import database
    import openrouter_service
except Exception as e:
    print(f"Import error: {e}")

# ============ MODELS ============

class WorkspaceCreate(BaseModel):
    name: str
    description: Optional[str] = None

class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class AnalysisRequest(BaseModel):
    document_id: int
    analysis_type: str = "summarize"
    question: Optional[str] = None
    chart_type: Optional[str] = "bar"

class CompareRequest(BaseModel):
    document_ids: List[int]
    workspace_id: Optional[int] = None

class DecisionMatrixRequest(BaseModel):
    document_ids: List[int]
    criteria: List[dict]
    name: str
    workspace_id: Optional[int] = None

class QARequest(BaseModel):
    document_ids: List[int]
    question: str
    workspace_id: Optional[int] = None

# ============ HELPER FUNCTIONS ============

def serialize_datetime(obj):
    """Convert datetime objects to ISO format strings"""
    if hasattr(obj, 'isoformat'):
        return obj.isoformat()
    return obj

def serialize_result(result):
    """Serialize database result with datetime handling"""
    if isinstance(result, list):
        return [{k: serialize_datetime(v) for k, v in r.items()} for r in result]
    elif isinstance(result, dict):
        return {k: serialize_datetime(v) for k, v in result.items()}
    return result

# ============ ROOT ============

@app.get("/")
async def root():
    return {"message": "Document Analysis API", "version": "2.0.0", "features": [
        "workspaces", "documents", "analysis", "comparison", "decision_matrix", "qa", "charts", "reports"
    ]}

# ============ WORKSPACES ============

@app.post("/workspaces")
async def create_workspace(workspace: WorkspaceCreate):
    workspace_id = database.create_workspace(workspace.name, workspace.description)
    return {"id": workspace_id, "name": workspace.name, "description": workspace.description}

@app.get("/workspaces")
async def list_workspaces():
    workspaces = database.get_workspaces()
    return serialize_result(workspaces)

@app.get("/workspaces/{workspace_id}")
async def get_workspace(workspace_id: int):
    workspace = database.get_workspace(workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    docs = database.get_documents_by_workspace(workspace_id)
    result = serialize_result(workspace)
    result["documents"] = serialize_result(docs)
    return result

@app.put("/workspaces/{workspace_id}")
async def update_workspace(workspace_id: int, workspace: WorkspaceUpdate):
    database.update_workspace(workspace_id, workspace.name, workspace.description)
    return {"message": "Workspace updated"}

@app.delete("/workspaces/{workspace_id}")
async def delete_workspace(workspace_id: int):
    database.delete_workspace(workspace_id)
    return {"message": "Workspace deleted"}

@app.post("/workspaces/{workspace_id}/assign-all")
async def assign_all_docs_to_workspace(workspace_id: int):
    """Assign all documents to a specific workspace"""
    count = database.assign_all_documents_to_workspace(workspace_id)
    return {"message": f"Assigned {count} documents to workspace {workspace_id}"}

# ============ DOCUMENTS ============

@app.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    workspace_id: Optional[int] = Form(default=None),
    auto_analyze: bool = Form(default=True)
):
    print(f"Upload received - workspace_id: {workspace_id}, auto_analyze: {auto_analyze}")
    
    allowed_types = ["pdf", "docx", "doc", "png", "jpg", "jpeg", "gif", "webp", "txt", "md", "csv"]
    filename = file.filename or "unknown"
    file_ext = filename.split(".")[-1].lower() if "." in filename else ""
    
    if file_ext not in allowed_types:
        raise HTTPException(status_code=400, detail=f"File type not supported. Allowed: {', '.join(allowed_types)}")
    
    file_data = await file.read()
    file_size = len(file_data)
    
    if file_size > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 15MB.")
    
    doc_id = database.save_document(filename, file_ext, file_size, file_data, workspace_id)
    print(f"Document saved with id: {doc_id}, workspace_id: {workspace_id}")
    
    # Auto-analyze document to get suggestions (saves API credits by doing once)
    suggestions = None
    if auto_analyze:
        try:
            print(f"Auto-analyzing document {doc_id}: {filename}")
            suggestions = await openrouter_service.get_analysis_suggestions(file_data, filename, file_ext)
            database.update_document_suggestions(doc_id, json.dumps(suggestions))
            print(f"Suggestions saved for document {doc_id}")
        except Exception as e:
            print(f"Auto-analysis failed for {doc_id}: {e}")
            # Don't fail upload if analysis fails
    
    return {
        "id": doc_id, 
        "filename": filename, 
        "file_type": file_ext, 
        "file_size": file_size, 
        "workspace_id": workspace_id,
        "suggestions": suggestions
    }

@app.post("/upload-multiple")
async def upload_multiple_documents(
    files: List[UploadFile] = File(...),
    workspace_id: Optional[int] = Form(default=None)
):
    results = []
    for file in files:
        try:
            result = await upload_document(file, workspace_id)
            results.append(result)
        except HTTPException as e:
            results.append({"filename": file.filename, "error": e.detail})
    return {"uploaded": results}

@app.get("/documents")
async def list_documents(workspace_id: Optional[int] = Query(default=None)):
    if workspace_id:
        docs = database.get_documents_by_workspace(workspace_id)
    else:
        docs = database.get_all_documents()
    # Parse suggestions JSON
    for doc in docs:
        if doc.get("suggestions") and isinstance(doc["suggestions"], str):
            try:
                doc["suggestions"] = json.loads(doc["suggestions"])
            except:
                doc["suggestions"] = None
    return serialize_result(docs)

@app.get("/documents/{doc_id}")
async def get_document(doc_id: int):
    doc = database.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {
        "id": doc["id"],
        "filename": doc["filename"],
        "file_type": doc["file_type"],
        "file_size": doc["file_size"],
        "page_count": doc["page_count"],
        "workspace_id": doc["workspace_id"],
        "created_at": serialize_datetime(doc["created_at"])
    }

@app.delete("/documents/{doc_id}")
async def delete_document(doc_id: int):
    database.delete_document(doc_id)
    return {"message": "Document deleted"}

@app.put("/documents/{doc_id}/workspace")
async def move_document_to_workspace(doc_id: int, workspace_id: int = Query(...)):
    database.update_document_workspace(doc_id, workspace_id)
    return {"message": "Document moved to workspace"}

# ============ ANALYSIS ============

@app.post("/analyze")
async def analyze_document(request: AnalysisRequest):
    doc = database.get_document(request.document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        print(f"Analyzing document {request.document_id} with type {request.analysis_type}")
        result = await openrouter_service.analyze_document(
            file_data=doc["file_data"],
            filename=doc["filename"],
            file_type=doc["file_type"],
            analysis_type=request.analysis_type,
            question=request.question,
            chart_type=request.chart_type
        )
        
        analysis_id = database.save_analysis(
            document_id=request.document_id,
            analysis_type=request.analysis_type,
            result_json=json.dumps(result)
        )
        
        return {"analysis_id": analysis_id, "result": result}
    except Exception as e:
        import traceback
        print(f"Analysis error: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze-upload")
async def upload_and_analyze(
    file: UploadFile = File(...),
    analysis_type: str = Form(default="summarize"),
    workspace_id: Optional[int] = Form(default=None)
):
    upload_result = await upload_document(file, workspace_id)
    request = AnalysisRequest(document_id=upload_result["id"], analysis_type=analysis_type)
    analysis_result = await analyze_document(request)
    return {"document": upload_result, "analysis": analysis_result}

@app.get("/analysis/{doc_id}")
async def get_analysis_history(doc_id: int):
    results = database.get_analysis_by_document(doc_id)
    for r in results:
        r["result_json"] = json.loads(r["result_json"])
        r["created_at"] = serialize_datetime(r["created_at"])
    return results

# ============ COMPARISON ============

@app.post("/compare")
async def compare_documents(request: CompareRequest):
    if len(request.document_ids) < 2:
        raise HTTPException(status_code=400, detail="At least 2 documents required for comparison")
    
    documents = []
    for doc_id in request.document_ids:
        doc = database.get_document(doc_id)
        if not doc:
            raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
        documents.append({
            "id": doc_id,
            "name": doc["filename"],
            "type": doc["file_type"],
            "data": doc["file_data"]
        })
    
    try:
        print(f"Comparing {len(documents)} documents")
        if len(documents) == 2:
            result = await openrouter_service.compare_two_documents(
                documents[0]["data"], documents[0]["name"], documents[0]["type"],
                documents[1]["data"], documents[1]["name"], documents[1]["type"]
            )
        else:
            result = await openrouter_service.compare_multiple_documents(documents)
        
        comparison_id = database.save_comparison(
            document_ids=request.document_ids,
            result_json=json.dumps(result),
            workspace_id=request.workspace_id
        )
        
        return {"comparison_id": comparison_id, "result": result}
    except Exception as e:
        import traceback
        print(f"Compare error: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/comparisons")
async def list_comparisons(workspace_id: Optional[int] = Query(default=None)):
    comparisons = database.get_comparisons(workspace_id)
    for c in comparisons:
        c["document_ids"] = json.loads(c["document_ids"]) if isinstance(c["document_ids"], str) else c["document_ids"]
        c["result_json"] = json.loads(c["result_json"])
        c["created_at"] = serialize_datetime(c["created_at"])
    return comparisons

# ============ DECISION MATRIX ============

@app.post("/decision-matrix")
async def create_decision_matrix(request: DecisionMatrixRequest):
    if len(request.document_ids) < 2:
        raise HTTPException(status_code=400, detail="At least 2 documents required")
    
    # Validate criteria weights sum to 1.0
    total_weight = sum(c.get("weight", 0) for c in request.criteria)
    if abs(total_weight - 1.0) > 0.01:
        raise HTTPException(status_code=400, detail=f"Criteria weights must sum to 1.0 (current: {total_weight})")
    
    documents = []
    for doc_id in request.document_ids:
        doc = database.get_document(doc_id)
        if not doc:
            raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
        documents.append({
            "id": doc_id,
            "name": doc["filename"],
            "type": doc["file_type"],
            "data": doc["file_data"]
        })
    
    try:
        result = await openrouter_service.build_decision_matrix(documents, request.criteria)
        
        matrix_id = database.save_decision_matrix(
            name=request.name,
            criteria=request.criteria,
            options=[{"id": d["id"], "name": d["name"]} for d in documents],
            result_json=json.dumps(result),
            workspace_id=request.workspace_id
        )
        
        return {"matrix_id": matrix_id, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/decision-matrices")
async def list_decision_matrices(workspace_id: Optional[int] = Query(default=None)):
    matrices = database.get_decision_matrices(workspace_id)
    for m in matrices:
        m["criteria"] = json.loads(m["criteria"]) if isinstance(m["criteria"], str) else m["criteria"]
        m["options"] = json.loads(m["options"]) if isinstance(m["options"], str) else m["options"]
        if m["result_json"]:
            m["result_json"] = json.loads(m["result_json"])
        m["created_at"] = serialize_datetime(m["created_at"])
    return matrices

# ============ Q&A ============

@app.post("/qa")
async def ask_question(request: QARequest):
    if not request.document_ids:
        raise HTTPException(status_code=400, detail="At least one document required")
    
    # For now, use the first document (can be extended to multi-doc Q&A)
    doc = database.get_document(request.document_ids[0])
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        result = await openrouter_service.analyze_document(
            file_data=doc["file_data"],
            filename=doc["filename"],
            file_type=doc["file_type"],
            analysis_type="qa",
            question=request.question
        )
        
        qa_id = database.save_qa(
            question=request.question,
            answer_json=json.dumps(result),
            document_ids=request.document_ids,
            workspace_id=request.workspace_id
        )
        
        return {"qa_id": qa_id, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/qa-history")
async def get_qa_history(workspace_id: Optional[int] = Query(default=None), limit: int = Query(default=50)):
    history = database.get_qa_history(workspace_id, limit)
    for h in history:
        h["document_ids"] = json.loads(h["document_ids"]) if h["document_ids"] else []
        h["answer_json"] = json.loads(h["answer_json"])
        h["created_at"] = serialize_datetime(h["created_at"])
    return history

# ============ CHARTS ============

@app.post("/charts")
async def generate_chart(request: AnalysisRequest):
    doc = database.get_document(request.document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        result = await openrouter_service.analyze_document(
            file_data=doc["file_data"],
            filename=doc["filename"],
            file_type=doc["file_type"],
            analysis_type="chart",
            chart_type=request.chart_type or "bar"
        )
        
        chart_id = database.save_chart(
            document_id=request.document_id,
            chart_type=result.get("chart_type", "bar"),
            title=result.get("title", "Chart"),
            chart_data=result
        )
        
        return {"chart_id": chart_id, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/charts/{doc_id}")
async def get_document_charts(doc_id: int):
    charts = database.get_charts_by_document(doc_id)
    for c in charts:
        c["chart_data"] = json.loads(c["chart_data"]) if isinstance(c["chart_data"], str) else c["chart_data"]
        c["created_at"] = serialize_datetime(c["created_at"])
    return charts

# ============ REPORTS & SLIDES ============

@app.post("/report")
async def generate_report(request: AnalysisRequest):
    request.analysis_type = "report"
    return await analyze_document(request)

@app.post("/slides")
async def generate_slides(request: AnalysisRequest):
    request.analysis_type = "slides"
    return await analyze_document(request)

# ============ EXPORT ============

@app.get("/export/{doc_id}")
async def export_analysis(doc_id: int, format: str = Query(default="json")):
    """Export analysis results as JSON or CSV"""
    results = database.get_analysis_by_document(doc_id)
    if not results:
        raise HTTPException(status_code=404, detail="No analysis found for this document")
    
    if format == "csv":
        # Create CSV export
        import csv
        output = io.StringIO()
        writer = csv.writer(output)
        
        for r in results:
            result_data = json.loads(r["result_json"])
            writer.writerow(["Analysis Type", r["analysis_type"]])
            writer.writerow(["Created At", str(r["created_at"])])
            writer.writerow([])
            
            # Write key-value pairs
            for key, value in result_data.items():
                if isinstance(value, (str, int, float)):
                    writer.writerow([key, value])
                elif isinstance(value, list):
                    writer.writerow([key, json.dumps(value)])
            writer.writerow([])
        
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=analysis_{doc_id}.csv"}
        )
    else:
        # JSON export
        export_data = []
        for r in results:
            export_data.append({
                "analysis_type": r["analysis_type"],
                "created_at": serialize_datetime(r["created_at"]),
                "result": json.loads(r["result_json"])
            })
        return export_data

# ============ SMART SUGGESTIONS ============

@app.get("/suggest/{doc_id}")
async def get_suggestions(doc_id: int):
    """Get smart analysis suggestions for a document"""
    doc = database.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        result = await openrouter_service.get_analysis_suggestions(
            file_data=doc["file_data"],
            filename=doc["filename"],
            file_type=doc["file_type"]
        )
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
