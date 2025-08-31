import React, { useState, useCallback, useEffect } from 'react';
import {
  Upload, FileText, Image, Hash, MessageCircle, TrendingUp, X, AlertCircle
} from 'lucide-react';
import { validateFile, processFiles } from '../utils/textExtraction.js';

export default function ContentAnalyzer() {

  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [error, setError] = useState('');


  const [extractedText, setExtractedText] = useState('');
  const [suggestions, setSuggestions] = useState(null);

  
  const [processingProgress, setProcessingProgress] = useState({ stage: '', progress: 0 });
  const [showOverlay, setShowOverlay] = useState(false);


  useEffect(() => {
    if (!showOverlay) return;
    if (processingProgress.progress === 100) {
      const t = setTimeout(() => setShowOverlay(false), 1200);
      return () => clearTimeout(t);
    }
  }, [processingProgress.progress, showOverlay]);

  
  const getEngagementSuggestions = useCallback(async (text) => {
    try {
      const base = import.meta.env.VITE_API_BASE || 'http://localhost:5000';
      const r = await fetch(`${base}/api/analyze-content`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ text })
      });
      if (!r.ok) throw new Error('Failed to get suggestions');
      const data = await r.json();
      setSuggestions(data.suggestions);
    } catch {
      
      setSuggestions({
        hashtags: ['#content','#growth','#socialmedia','#discover','#reach','#creator'],
        caption: 'Make it relatable, short, and end with a question to spark comments.',
        tips: [
          'Post at your audience peak time',
          'Use 5–8 specific hashtags',
          'Lead with a hook in first 2 lines',
          'Reply to comments within 30 mins',
          'Pin your best comment to keep the thread alive'
        ]
      });
    }
  }, []);

  const processFilesWithProgress = useCallback(async (fileList) => {
    setShowOverlay(true);               
    setError('');
    setExtractedText('');
    setSuggestions(null);
    setProcessingProgress({ stage:'starting', progress:0 });

    try {
      const text = await processFiles(fileList, (p) => setProcessingProgress(p));
      setExtractedText(text);
      if (text.trim()) {
        setProcessingProgress({ stage:'analyzing', progress:90 });
        await getEngagementSuggestions(text);
      }
    } catch (e) {
      setError(e.message || 'Failed to process files');
    } finally {
      setProcessingProgress({ stage:'complete', progress:100 });
    }
  }, [getEngagementSuggestions]);

  const validateAndSetFiles = useCallback(async (fileList) => {
    const errors = [];
    const valid = [];
    fileList.forEach(f => {
      const v = validateFile(f);
      v.valid ? valid.push(f) : errors.push(`${f.name}: ${v.error}`);
    });
    setValidationErrors(errors);
    if (valid.length) {
      setFiles(valid);
      processFilesWithProgress(valid);
    } else if (errors.length) {
      setError('No valid files selected. Please check file types and sizes.');
    }
  }, [processFilesWithProgress]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    validateAndSetFiles(Array.from(e.dataTransfer.files));
  }, [validateAndSetFiles]);

  const handleFileChange = (e) => validateAndSetFiles(Array.from(e.target.files));

  const removeFile = (idx) => {
    const next = files.filter((_,i)=>i!==idx);
    setFiles(next);
    setValidationErrors([]);
    if (!next.length) {
      setExtractedText('');
      setSuggestions(null);
      setProcessingProgress({ stage:'', progress:0 });
    }
  };

  const getProgressMessage = () => {
    const {stage, currentFile, totalFiles, fileName, fileStage, detail} = processingProgress;
    if (stage==='starting') return 'Initializing file processing...';
    if (stage==='processing_file') {
      const fi = currentFile && totalFiles ? `(${currentFile}/${totalFiles})` : '';
      const st = fileStage ? ` • ${fileStage.replace('_',' ')}` : '';
      const de = detail ? ` • ${detail}` : '';
      return `Processing ${fileName || 'file'} ${fi}${st}${de}`;
    }
    if (stage==='analyzing') return 'Getting AI-powered engagement suggestions...';
    if (stage==='complete') return 'Processing complete!';
    return 'Processing files...';
  };


  return (
    <main className="layout">
      
      <aside className="side">
        <section
          onDrop={handleDrop}
          onDragOver={(e)=>{e.preventDefault(); setIsDragging(true);}}
          onDragLeave={()=>setIsDragging(false)}
          className={`dropzone ${isDragging?'drag':''}`}
        >
          <input type="file" multiple accept="image/*,.pdf" onChange={handleFileChange} className="filepick" />
          <div className="dz-icons">
            <div className="dz-i purple"><Upload size={18} /></div>
            <div className="dz-i blue"><FileText size={18} /></div>
            <div className="dz-i green"><Image size={18} /></div>
          </div>
          <div className="dz-title">{isDragging ? 'Drop files to start' : 'Drag & drop files here'}</div>
          <div className="dz-sub">or click to browse</div>
          <div className="dz-hint">PDF / PNG / JPG / JPEG • Max 10MB/file</div>
        </section>

        {validationErrors.length>0 && (
          <section className="panel warn">
            <div className="panel-title"><AlertCircle size={16}/> Validation Issues</div>
            {validationErrors.map((e,i)=>(
              <div key={i} className="row warn-row"><AlertCircle size={14}/> <span>{e}</span></div>
            ))}
          </section>
        )}

        <section className="card">
          <div className="card-title">
            <FileText size={16}/> {files.length > 0 ? 'Current File' : 'Waiting'}
          </div>
          {files.length===0 ? (
            <div className="placeholder">No files yet.</div>
          ) : files.map((f,i)=>(
            <div key={i} className="row file-row">
              <div className="row">
                {f.type==='application/pdf' ? <FileText className="pdf"/> : <Image className="img" />}
                <div>
                  <div className="fname" title={f.name}>{f.name}</div>
                  <div className="fmeta">{(f.size/1024/1024).toFixed(2)} MB</div>
                </div>
              </div>
              <button className="ghost" onClick={()=>removeFile(i)} title="Remove"><X size={16}/></button>
            </div>
          ))}
        </section>

        <section className="card">
          <div className="card-title"><FileText size={16}/> Raw Text</div>
          <div className="paper">
            <pre className="textblock">{extractedText || 'Upload to see extracted text '}</pre>
          </div>
        </section>

        {error && <section className="panel error"><div className="panel-title">Error</div><div>{error}</div></section>}
      </aside>

      <section className="center">
        <header className="center-head">
          <h2>Insights</h2>
          <button
            className="btn btn-dark"
            onClick={()=>{
              setFiles([]); setExtractedText(''); setSuggestions(null); setError('');
              setValidationErrors([]); setProcessingProgress({stage:'',progress:0});
            }}
          >Reset</button>
        </header>

        <div className="insights">
          <div className="card big">
            <div className="card-title"><MessageCircle size={16}/> Caption</div>
            <div className="panel soft">
              <p className="caption">
                {suggestions?.caption || 'Caption will appear here once analysis completes.'}
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><Hash size={16}/> Hashtags</div>
            <div className="tags">
              {suggestions?.hashtags?.length
                ? suggestions.hashtags.map((t,i)=>(<span className="tag" key={i}>{t}</span>))
                : <div className="placeholder">No hashtags yet.</div>}
            </div>
          </div>

          <div className="card">
            <div className="card-title"><TrendingUp size={16}/> Improve Engagement</div>
            <div className="tips">
              {suggestions?.tips?.length
                ? suggestions.tips.map((tip,i)=>(
                    <div key={i} className="tip">
                      <div className="bubble">{i+1}</div>
                      <div>{tip}</div>
                    </div>
                  ))
                : <div className="placeholder">Top suggestions for engagement</div>}
            </div>
          </div>
        </div>
      </section>

      {showOverlay && (
        <div className="overlay">
          <div className="overlay-card">
            <div className="overlay-row">
              <div className="ring"><div className="ring-spin" /></div>
              <div className="overlay-body">
                <div className="overlay-title">
                  {processingProgress.progress < 100 ? 'Processing…' : 'Almost done'}
                </div>
                <div className="overlay-msg">{getProgressMessage()}</div>
                <div className="overlay-bar">
                  <div className="overlay-fill" style={{ width: `${processingProgress.progress}%` }} />
                </div>
                <div className="overlay-sub">{processingProgress.progress}% complete</div>
              </div>
            </div>
            <div className="overlay-stages">
              {['Upload','Extract','Process','Analyze'].map((s, i) => {
                const p = processingProgress.progress;
                const active = p > i * 25;
                const done = p > (i + 1) * 25;
                return (
                  <div key={s} className="ov-stage">
                    <div className={`ov-dot ${done ? 'done' : active ? 'active' : ''}`}>{i+1}</div>
                    <div className={`ov-label ${active ? 'on' : ''}`}>{s}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
