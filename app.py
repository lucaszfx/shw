import os
import re
import hashlib
import time
import threading
import concurrent.futures
from flask import Flask, render_template, request, jsonify, send_from_directory, Response
import zipfile
import requests
import json
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
UPLOAD_FOLDER = 'uploads'
TRANSLATED_FOLDER = 'translated'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['TRANSLATED_FOLDER'] = TRANSLATED_FOLDER

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(TRANSLATED_FOLDER, exist_ok=True)

progress_updates = {}

# --- Prompts for AI ---
CLASSIFY_PROMPT = """
Você é um especialista em análise de scripts de jogos da Ren'Py. Sua tarefa é analisar uma lista de strings extraídas de arquivos .rpy e classificá-las.
Responda APENAS com um objeto JSON contendo uma única chave "classifications", que é uma lista de objetos. NÃO inclua ```json ou qualquer outra formatação.
Para cada string na entrada, crie um objeto com os seguintes atributos:
- "original": A string original.
- "is_translatable": Um booleano (true/false). Defina como false se for claramente código, um nome de arquivo, uma variável, ou texto que não deve ser traduzido.
- "classification": Classifique como "dialogue" (diálogos e narração), "ui" (texto de botão, menus, rótulos), "formatted_string" (contém tags de formatação como {color=...} ou [var]), ou "code" (se is_translatable for false).
- "proper_nouns": Uma lista de nomes próprios (personagens, locais específicos) que devem ser preservados durante a tradução.
Analise as seguintes strings:
"""

TRANSLATE_PROMPT = """
Você é um tradutor especialista de inglês para português do Brasil, focado em jogos de visual novel.
Sua tarefa é traduzir uma lista de strings, prestando muita atenção aos nomes próprios que devem ser preservados.
Responda APENAS com um objeto JSON contendo uma única chave "translations", que é uma lista de objetos. NÃO inclua ```json ou qualquer outra formatação.
Para cada string na entrada, crie um objeto com os seguintes atributos:
- "original": A string original.
- "translated": A tradução para o português do Brasil.
MANTENHA os nomes próprios listados em 'proper_nouns' EXATAMENTE como estão no texto original.
Traduza as seguintes strings:
"""

# --- Helper Functions for Parallel Execution ---
def _classify_batch(batch, api_key):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={api_key}"
    headers = {'Content-Type': 'application/json'}
    data = {"contents": [{"parts": [{"text": CLASSIFY_PROMPT + json.dumps(batch, ensure_ascii=False)}]}], "generationConfig": {"response_mime_type": "application/json"}}
    response = requests.post(url, headers=headers, data=json.dumps(data))
    if response.status_code != 200: raise Exception(f"Erro na API do Gemini: {response.text}")
    result = response.json()
    content = result.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '{}')
    return json.loads(content).get("classifications", [])

def _translate_batch(batch, api_key):
    strings_to_translate_with_context = [{"original": item['original'], "proper_nouns": item.get('proper_nouns', [])} for item in batch]
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={api_key}"
    headers = {'Content-Type': 'application/json'}
    data = {"contents": [{"parts": [{"text": TRANSLATE_PROMPT + json.dumps(strings_to_translate_with_context, ensure_ascii=False)}]}], "generationConfig": {"response_mime_type": "application/json"}}
    response = requests.post(url, headers=headers, data=json.dumps(data))
    if response.status_code != 200: raise Exception(f"Erro na API do Gemini durante a tradução: {response.text}")
    result = response.json()
    content = result.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '{}')
    return json.loads(content).get("translations", [])

# --- Main Application Logic ---
@app.route('/')
def index(): return render_template('index.html')

def run_translation_job(job_id, upload_path, api_key, folder_name):
    try:
        progress_updates[job_id] = {"progress": 5, "message": "Descompactando arquivo do jogo..."}
        extraction_path = os.path.join(app.config['TRANSLATED_FOLDER'], job_id, 'source')
        os.makedirs(extraction_path, exist_ok=True)
        with zipfile.ZipFile(upload_path, 'r') as z: z.extractall(extraction_path)

        progress_updates[job_id] = {"progress": 10, "message": "Extraindo textos dos arquivos..."}
        rpy_files = [os.path.join(r, f) for r, _, fs in os.walk(extraction_path) for f in fs if f.endswith('.rpy')]
        if not rpy_files: raise ValueError("Nenhum arquivo .rpy encontrado no zip")

        all_strings = set().union(*(extract_strings_from_rpy(f) for f in rpy_files))
        if not all_strings: raise ValueError("Nenhum texto traduzível encontrado")

        classified_strings = classify_strings_with_ai(list(all_strings), api_key, job_id)
        translated_strings = translate_strings_with_ai(classified_strings, api_key, job_id)

        progress_updates[job_id] = {"progress": 95, "message": "Gerando e compactando arquivos finais..."}
        output_zip_name = f"translated_{job_id}.zip"
        result_zip_path = os.path.join(app.config['TRANSLATED_FOLDER'], output_zip_name)
        result_dir = os.path.join(app.config['TRANSLATED_FOLDER'], job_id, 'result')
        final_translation_dir = os.path.join(result_dir, 'tl', folder_name)
        os.makedirs(final_translation_dir, exist_ok=True)
        generate_translation_files(translated_strings, final_translation_dir, folder_name)

        with zipfile.ZipFile(result_zip_path, 'w') as zf:
             for r, _, fs in os.walk(result_dir):
                for f in fs: zf.write(os.path.join(r, f), os.path.relpath(os.path.join(r, f), result_dir))

        progress_updates[job_id] = {"progress": 100, "message": "Tradução concluída!", "status": "complete", "download_url": f'/download/{output_zip_name}'}
    except Exception as e:
        progress_updates[job_id] = {"progress": 100, "message": f"Erro: {str(e)}", "status": "error"}

@app.route('/translate', methods=['POST'])
def translate():
    if 'game_zip' not in request.files: return jsonify({'error': 'Nenhum arquivo enviado'}), 400
    file = request.files['game_zip']
    api_key, folder_name = request.form.get('api_key'), request.form.get('folder_name', 'ptbyshw')
    if not file.filename or not api_key: return jsonify({'error': 'Todos os campos são obrigatórios'}), 400

    if file and file.filename.endswith('.zip'):
        job_id = f"{int(time.time())}"
        upload_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{job_id}.zip")
        file.save(upload_path)
        threading.Thread(target=run_translation_job, args=(job_id, upload_path, api_key, folder_name)).start()
        return jsonify({'job_id': job_id})
    return jsonify({'error': 'Formato de arquivo inválido'}), 400

def extract_strings_from_rpy(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            return {s.strip() for s in re.findall(r'"((?:\\.|[^"\\])+)"', content) if len(s.strip()) > 1 and re.search(r'[a-zA-Z]', s)}
    except (IOError, UnicodeDecodeError) as e:
        print(f"Warning: Could not read file {file_path}. Skipping. Reason: {e}")
        return set()

def classify_strings_with_ai(strings, api_key, job_id):
    all_classified, batch_size = [], 100
    batches = [strings[i:i + batch_size] for i in range(0, len(strings), batch_size)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        future_to_batch = {executor.submit(_classify_batch, b, api_key): b for b in batches}
        for i, future in enumerate(concurrent.futures.as_completed(future_to_batch)):
            progress = 15 + int(((i + 1) / len(batches)) * 40)
            progress_updates[job_id] = {"progress": progress, "message": f"Classificando textos... (lote {i+1} de {len(batches)})"}
            all_classified.extend(future.result())
    return all_classified

def translate_strings_with_ai(classified_strings, api_key, job_id):
    translatable = [item for item in classified_strings if item.get('is_translatable')]
    batch_size, translated_map = 50, {}
    batches = [translatable[i:i + batch_size] for i in range(0, len(translatable), batch_size)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        future_to_batch = {executor.submit(_translate_batch, b, api_key): b for b in batches}
        for i, future in enumerate(concurrent.futures.as_completed(future_to_batch)):
            progress = 55 + int(((i + 1) / len(batches)) * 40)
            progress_updates[job_id] = {"progress": progress, "message": f"Traduzindo textos... (lote {i+1} de {len(batches)})"}
            for item in future.result(): translated_map[item['original']] = item['translated']
    for item in classified_strings:
        if item.get('is_translatable') and item['original'] in translated_map:
            item['translated'] = translated_map[item['original']]
    return classified_strings

def generate_translation_files(translated_strings, output_dir, lang):
    dialogues, non_dialogue = [], {}
    for item in translated_strings:
        if not item.get('is_translatable') or 'translated' not in item: continue
        if item.get('classification') == 'dialogue':
            dialogues.append((hashlib.sha1(item['original'].encode()).hexdigest()[:8], item['original'], item['translated']))
        elif item.get('classification') in ['ui', 'formatted_string']:
            non_dialogue[item['original']] = item['translated']
    with open(os.path.join(output_dir, 'dialogue.rpy'), 'w', encoding='utf-8') as f:
        for i, o, t in dialogues: f.write(f'translate {lang} {i}:\n    # "{o}"\n    "{t}"\n\n')
    with open(os.path.join(output_dir, 'strings.json'), 'w', encoding='utf-8') as f: json.dump(non_dialogue, f, indent=2, ensure_ascii=False)
    try:
        with open('replaceText.txt', 'r', encoding='utf-8') as s, open(os.path.join(output_dir, 'replaceText.rpy'), 'w', encoding='utf-8') as d: d.write(s.read())
    except FileNotFoundError: print("Warning: replaceText.txt not found.")

@app.route('/progress/<job_id>')
def progress(job_id):
    def generate():
        while True:
            if job_id in progress_updates:
                data = progress_updates[job_id]
                yield f"data: {json.dumps(data)}\n\n"
                if data.get("status") in ["complete", "error"]:
                    progress_updates.pop(job_id, None)
                    break
            time.sleep(1)
    return Response(generate(), mimetype='text/event-stream')

@app.route('/download/<filename>')
def download(filename): return send_from_directory(app.config['TRANSLATED_FOLDER'], filename, as_attachment=True)

if __name__ == '__main__': app.run(debug=True, host='0.0.0.0', port=8080)
