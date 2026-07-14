import streamlit as st

from langchain_core.documents import Document
from langchain_core.vectorstores import InMemoryVectorStore
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_ollama import ChatOllama, OllamaEmbeddings

# -------------------------
# Load LLM
# -------------------------

llm = ChatOllama(
    model="llama3.2:latest",
    temperature=0
)

embeddings = OllamaEmbeddings(
    model="nomic-embed-text:latest"
)

# -------------------------
# Read TXT file
# -------------------------

with open("knowledge.txt", "r", encoding="utf-8") as f:
    text = f.read()

document = Document(page_content=text)

# -------------------------
# Split document
# -------------------------

splitter = RecursiveCharacterTextSplitter(
    chunk_size=300,
    chunk_overlap=50
)

docs = splitter.split_documents([document])

# -------------------------
# Create Vector Store
# -------------------------

vector_store = InMemoryVectorStore(embeddings)

vector_store.add_documents(docs)

retriever = vector_store.as_retriever()

# -------------------------
# Streamlit UI
# -------------------------

st.title("Simple RAG Chatbot")

# Initialize chat history
if "messages" not in st.session_state:
    st.session_state.messages = []

# Display previous messages
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

# Chat input
if question := st.chat_input("Ask a question"):

    # Display user message
    st.chat_message("user").markdown(question)

    # Save user message
    st.session_state.messages.append(
        {
            "role": "user",
            "content": question
        }
    )

    # Retrieve relevant documents
    retrieved_docs = retriever.invoke(question)

    context = "\n\n".join(
        doc.page_content for doc in retrieved_docs
    )

    # Build conversation history
    history = ""

    for msg in st.session_state.messages:
        history += f"{msg['role']}: {msg['content']}\n"

    prompt = f"""
You are a helpful assistant.

Use the retrieved context to answer the question.

Conversation History:
{history}

Retrieved Context:
{context}

Current Question:
{question}

Answer:
"""

    response = llm.invoke(prompt)

    answer = response.content

    # Display assistant response
    with st.chat_message("assistant"):
        st.markdown(answer)

    # Save assistant response
    st.session_state.messages.append(
        {
            "role": "assistant",
            "content": answer
        }
    )