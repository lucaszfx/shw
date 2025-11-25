import os
import re
import hashlib
from flask import Flask, render_template, request, jsonify, send_from_directory
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

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/translate', methods=['POST'])
def translate():
    if 'game_zip' not in request.files:
        return jsonify({'error': 'Nenhum arquivo enviado'}), 400

    file = request.files['game_zip']
    api_key = request.form.get('api_key')
    folder_name = request.form.get('folder_name', 'ptbyshw')

    if file.filename == '':
        return jsonify({'error': 'Nenhum arquivo selecionado'}), 400

    if not api_key:
        return jsonify({'error': 'Chave da API não fornecida'}), 400

    if file and file.filename.endswith('.zip'):
        # Create a unique directory for this translation job
        import time
        import uuid
        job_id = f"{int(time.time())}_{uuid.uuid4().hex[:8]}"

        upload_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{job_id}.zip")
        extraction_path = os.path.join(app.config['TRANSLATED_FOLDER'], job_id, 'source')

        os.makedirs(extraction_path, exist_ok=True)
        file.save(upload_path)

        # Unzip the file
        try:
            with zipfile.ZipFile(upload_path, 'r') as zip_ref:
                zip_ref.extractall(extraction_path)
        except zipfile.BadZipFile:
            return jsonify({'error': 'Arquivo zip inválido ou corrompido'}), 400

        # Find all .rpy files recursively
        rpy_files = []
        for root, _, files in os.walk(extraction_path):
            for filename in files:
                if filename.endswith('.rpy'):
                    rpy_files.append(os.path.join(root, filename))

        if not rpy_files:
            return jsonify({'error': 'Nenhum arquivo .rpy encontrado no zip'}), 400

        # Step 4: Extract and Classify Text with AI
        all_strings = set()
        for rpy_file in rpy_files:
            all_strings.update(extract_strings_from_rpy(rpy_file))

        if not all_strings:
            return jsonify({'error': 'Nenhum texto traduzível encontrado nos arquivos .rpy'}), 400

        try:
            classified_strings = classify_strings_with_ai(list(all_strings), api_key)
            print(f"Successfully classified {len(classified_strings)} strings.")

            # Step 5: Translate with AI
            translated_strings = translate_strings_with_ai(classified_strings, api_key)
            print(f"Successfully translated {len([s for s in translated_strings if 'translated' in s])} strings.")

        except Exception as e:
            return jsonify({'error': str(e)}), 500

        # Placeholder for the next step (File Generation)
        output_zip_name = f"translated_{job_id}.zip"
        result_zip_path = os.path.join(app.config['TRANSLATED_FOLDER'], output_zip_name)

        result_dir = os.path.join(app.config['TRANSLATED_FOLDER'], job_id, 'result')
        final_translation_dir = os.path.join(result_dir, 'tl', folder_name)
        os.makedirs(final_translation_dir, exist_ok=True)

        # Step 6: Generate Translation Files
        try:
            # The 'folder_name' from the user becomes the language identifier for Ren'Py
            generate_translation_files(translated_strings, final_translation_dir, folder_name)
            print("Successfully generated translation files.")
        except Exception as e:
            return jsonify({'error': f"Erro ao gerar arquivos de tradução: {e}"}), 500

        with zipfile.ZipFile(result_zip_path, 'w') as zipf:
             for root, _, files in os.walk(result_dir):
                for f in files:
                    zipf.write(os.path.join(root, f), os.path.relpath(os.path.join(root, f), result_dir))

        return jsonify({'download_url': f'/download/{output_zip_name}'})

    return jsonify({'error': 'Formato de arquivo inválido. Por favor, envie um .zip'}), 400

def extract_strings_from_rpy(file_path):
    """Extracts all unique, non-empty strings from a Ren'Py .rpy file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            # This regex finds strings in double quotes, handling escaped quotes.
            # It also filters out very short or purely numeric/symbolic strings.
            strings = re.findall(r'"((?:\\.|[^"\\])+)"', content)
            # Filter out strings that are likely not translatable content
            return {s.strip() for s in strings if len(s.strip()) > 1 and re.search(r'[a-zA-Z]', s)}
    except (IOError, UnicodeDecodeError) as e:
        print(f"Warning: Could not read file {file_path}. Skipping. Reason: {e}")
        return set()

def classify_strings_with_ai(strings, api_key):
    """Uses Gemini AI to classify strings as dialogue, UI, formatted, or code."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={api_key}"

    # Batch strings to avoid hitting API limits
    batch_size = 100
    all_classified_strings = []

    for i in range(0, len(strings), batch_size):
        batch = strings[i:i + batch_size]

        prompt = """
        Você é um especialista em análise de scripts de jogos da Ren'Py. Sua tarefa é analisar uma lista de strings extraídas de arquivos .rpy e classificá-las.
        Responda APENAS com um objeto JSON contendo uma única chave "classifications", que é uma lista de objetos. NÃO inclua ```json ou qualquer outra formatação.
        Para cada string na entrada, crie um objeto com os seguintes atributos:
        - "original": A string original.
        - "is_translatable": Um booleano (true/false). Defina como false se for claramente código, um nome de arquivo, uma variável, ou texto que não deve ser traduzido.
        - "classification": Classifique como "dialogue" (diálogos e narração), "ui" (texto de botão, menus, rótulos), "formatted_string" (contém tags de formatação como {color=...} ou [var]), ou "code" (se is_translatable for false).
        - "proper_nouns": Uma lista de nomes próprios (personagens, locais específicos) que devem ser preservados durante a tradução.

        Exemplo de resposta:
        {
          "classifications": [
            {
              "original": "Eu deveria falar com a Vados agora.",
              "is_translatable": true,
              "classification": "dialogue",
              "proper_nouns": ["Vados"]
            },
            {
              "original": "Start Game",
              "is_translatable": true,
              "classification": "ui",
              "proper_nouns": []
            },
            {
              "original": "images/ui/main_menu.png",
              "is_translatable": false,
              "classification": "code",
              "proper_nouns": []
            }
          ]
        }

        Analise as seguintes strings:
        """ + json.dumps(batch, ensure_ascii=False)

        headers = {'Content-Type': 'application/json'}
        data = {
            "contents": [{
                "parts": [{"text": prompt}]
            }],
            "generationConfig": {
                "response_mime_type": "application/json",
            }
        }

        response = requests.post(url, headers=headers, data=json.dumps(data))

        if response.status_code != 200:
            raise Exception(f"Erro na API do Gemini: {response.text}")

        try:
            result = response.json()
            # Navigate through the Gemini API's JSON structure
            content = result.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '{}')
            classified_data = json.loads(content)
            all_classified_strings.extend(classified_data.get("classifications", []))
        except (json.JSONDecodeError, IndexError, KeyError) as e:
            raise Exception(f"Não foi possível analisar a resposta da IA ou a estrutura é inesperada: {e}\nResposta recebida: {response.text}")

    return all_classified_strings

def translate_strings_with_ai(classified_strings, api_key):
    """Uses Gemini AI to translate the classified strings."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={api_key}"

    # Filter for translatable strings
    translatable_items = [item for item in classified_strings if item.get('is_translatable')]

    # Create a mapping from original string to item to easily merge results
    original_to_item_map = {item['original']: item for item in translatable_items}

    # Batch strings for translation
    batch_size = 50 # Smaller batch for translation to ensure prompt quality
    all_translated_strings = {}

    for i in range(0, len(translatable_items), batch_size):
        batch = translatable_items[i:i + batch_size]

        # Prepare a list of strings and their context (proper nouns) for the prompt
        strings_to_translate_with_context = [
            {"original": item['original'], "proper_nouns": item.get('proper_nouns', [])}
            for item in batch
        ]

        prompt = """
        Você é um tradutor especialista de inglês para português do Brasil, focado em jogos de visual novel.
        Sua tarefa é traduzir uma lista de strings, prestando muita atenção aos nomes próprios que devem ser preservados.
        Responda APENAS com um objeto JSON contendo uma única chave "translations", que é uma lista de objetos. NÃO inclua ```json ou qualquer outra formatação.
        Para cada string na entrada, crie um objeto com os seguintes atributos:
        - "original": A string original.
        - "translated": A tradução para o português do Brasil.

        MANTENHA os nomes próprios listados em 'proper_nouns' EXATAMENTE como estão no texto original.

        Exemplo de resposta:
        {
          "translations": [
            {
              "original": "I should go talk to Vados now.",
              "translated": "Eu deveria falar com a Vados agora."
            },
            {
              "original": "Location: Capsule Corp",
              "translated": "Local: Capsule Corp"
            }
          ]
        }

        Traduza as seguintes strings:
        """ + json.dumps(strings_to_translate_with_context, ensure_ascii=False)

        headers = {'Content-Type': 'application/json'}
        data = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"response_mime_type": "application/json"}
        }

        response = requests.post(url, headers=headers, data=json.dumps(data))

        if response.status_code != 200:
            raise Exception(f"Erro na API do Gemini durante a tradução: {response.text}")

        try:
            result = response.json()
            content = result['candidates'][0]['content']['parts'][0]['text']
            translated_data = json.loads(content)

            for item in translated_data.get("translations", []):
                all_translated_strings[item['original']] = item['translated']

        except (json.JSONDecodeError, IndexError, KeyError) as e:
            raise Exception(f"Não foi possível analisar a resposta de tradução da IA: {e}\nResposta recebida: {response.text}")

    # Merge translations back into the original classified_strings structure
    for item in classified_strings:
        if item.get('is_translatable') and item['original'] in all_translated_strings:
            item['translated'] = all_translated_strings[item['original']]

    return classified_strings


@app.route('/download/<filename>')
def download(filename):
    return send_from_directory(app.config['TRANSLATED_FOLDER'], filename, as_attachment=True)

def generate_translation_files(translated_strings, output_dir, language_identifier):
    """Generates the final translation files from the translated data."""

    dialogues = []
    # Combine ui and formatted strings into one dictionary for strings.json
    non_dialogue_strings = {}

    for item in translated_strings:
        if not item.get('is_translatable') or 'translated' not in item:
            continue

        classification = item.get('classification')
        original = item['original']
        translated = item['translated']

        if classification == 'dialogue':
            # Create a unique, stable identifier for the dialogue block
            identifier = hashlib.sha1(original.encode()).hexdigest()[:8]
            dialogues.append((identifier, original, translated))
        elif classification in ['ui', 'formatted_string']:
            non_dialogue_strings[original] = translated

    # --- Write dialogue.rpy ---
    with open(os.path.join(output_dir, 'dialogue.rpy'), 'w', encoding='utf-8') as f:
        for identifier, original, translated in dialogues:
            f.write(f"translate {language_identifier} {identifier}:\n")
            f.write(f'    # "{original}"\n')
            f.write(f'    "{translated}"\n\n')

    # --- Write strings.json ---
    # This now contains both UI and formatted strings
    with open(os.path.join(output_dir, 'strings.json'), 'w', encoding='utf-8') as f:
        json.dump(non_dialogue_strings, f, indent=2, ensure_ascii=False)

    # --- Copy replaceText.rpy ---
    try:
        with open('replaceText.txt', 'r', encoding='utf-8') as src:
            with open(os.path.join(output_dir, 'replaceText.rpy'), 'w', encoding='utf-8') as dest:
                dest.write(src.read())
    except FileNotFoundError:
        print("Warning: replaceText.txt not found. This file will be skipped.")


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8080)
