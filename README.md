# Game Translator & Emulator

Este projeto é um emulador web para jogos HTML5 (focado em RPG Maker MV/MZ/NW.js) que injeta uma camada de tradução automática em tempo real utilizando a API do Google Gemini.

## Dependências

As principais dependências do projeto são:

*   **Node.js**: Ambiente de execução JavaScript.
*   **express**: Framework web para o servidor.
*   **multer**: Middleware para upload de arquivos.
*   **adm-zip**: Biblioteca para extração de arquivos ZIP.
*   **body-parser**: Middleware para parsing de requisições JSON.
*   **cors**: Middleware para habilitar CORS.

Você pode ver a lista completa em `package.json`.

## Passo a Passo para Utilização

### 1. Instalação

Certifique-se de ter o [Node.js](https://nodejs.org/) instalado.

No diretório do projeto, execute:

```bash
npm install
```

### 2. Executar o Servidor

Inicie o servidor local com o comando:

```bash
node server.js
```

O servidor iniciará em `http://localhost:3000`.

### 3. Usando a Aplicação

1.  Abra seu navegador e acesse `http://localhost:3000`.
2.  **Upload do Jogo**:
    *   Arraste e solte um arquivo `.zip` do seu jogo HTML/RPG Maker na área indicada ou clique para selecionar.
    *   Aguarde o upload e a extração.
3.  **Jogar**:
    *   Após o upload, o jogo aparecerá na lista abaixo. Clique em **Play**.
4.  **Configurar Tradução**:
    *   Ao abrir o jogo, você verá um painel "Game Translator" no canto superior direito.
    *   Mude o **Mode** para **AI (Gemini)**.
    *   Insira sua **Gemini API Key**.
    *   (Opcional) Escolha o modelo (ex: `gemini-1.5-flash`) e o idioma de destino (padrão `pt-BR`).
    *   Clique em **Start AI Translation**.
5.  **Aproveite**:
    *   O sistema tentará traduzir os textos desenhados na tela (Canvas) em tempo real.
