from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from langchain.agents import create_agent
from dotenv import load_dotenv

load_dotenv()

llm = ChatOllama(
    model="llama3.2:latest",
    temperature=0.7,
)

# llm = ChatOpenAI(
#     api_key=API_KEY,
#     base_url=url,
#     model = MODEL_NAME
# )

agent = create_agent(
    model=llm,
    tools=[],
    system_prompt="You are a helpful assistant that can answer questions and provide information.",
)

messages = []

while True:
    user_input = input("You: ")

    if user_input.lower() == "bye":
        print("Goodbye!")
        break

    messages.append(("user", user_input))

    response = agent.invoke({
        "messages": messages
    })

    assistant_response = response["messages"][-1].content
    print("Assistant:", assistant_response)
    print()

    messages.append(("assistant", assistant_response))
    