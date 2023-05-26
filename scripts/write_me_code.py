import time
import openai
import subprocess
import os
import json
from dotenv import load_dotenv

# Load .env file
load_dotenv()
openai.api_key = os.getenv('OPENAI_API_KEY')

# Configuration
language = 'typescript'
framework = 'serverless.yaml'
cloud_service = 'aws'
default_function_name = 'encodeVideoFFmpeg'
default_prompt = "encode a video as an input arg with ffmpeg to x264 animation tune option and slow preset with aac audio and using two pass mode without b frames and key frames every 10 seconds. output to a file encode.mp4, keep output simple without all the license and extra stuff, just the output frames activity input/output details and warnings."
code_only = "do not conversate, do not add anything to the output except code. output with ``` at the beginning and end of the code using markdown formatting. make sure to include the needed imports in the script."

model = 'gpt-3.5-turbo'
max_tokens = 500  # Increase this number as needed

def setup_tsconfig():
    tsconfig = {
        "compilerOptions": {
            "target": "es5",
            "module": "commonjs",
            "strict": True,
            "esModuleInterop": True,
            "types": ["jest"]
        }
    }
    with open('tsconfig.json', 'w') as f:
        json.dump(tsconfig, f, indent=2)

def setup_npm_project(project_name):
    if not os.path.exists(project_name):
        os.makedirs(project_name)
    os.chdir(project_name)
    subprocess.run(['npm', 'init', '-y'])
    subprocess.run(['npm', 'install', '-g', 'serverless'])
    subprocess.run(['npm', 'install', '--save-dev', 'jest'])
    subprocess.run(['npm', 'install', '--save-dev', 'ts-jest'])
    subprocess.run(['npx', 'jest', '--init'])
    subprocess.run(['npm', 'install', '--save-dev', '@types/jest'])
    subprocess.run(['npm', 'install', '--save-dev', 'serverless-offline'])

    # Initialize git
    subprocess.run(['git', 'init'])

     # Update the scripts in package.json
    with open('package.json') as f:
        data = json.load(f)
    data['scripts']['install'] = 'npm install'
    data['scripts']['build'] = 'tsc'
    with open('package.json', 'w') as f:
        json.dump(data, f, indent=2)

    # Add package.json to git
    subprocess.run(['git', 'add', 'package.json'])

    # Create jest.config.js
    jest_config = "module.exports = {\n  preset: 'ts-jest',\n  testEnvironment: 'node',\n};\n"
    with open('jest.config.js', 'w') as f:
        f.write(jest_config)

    # Add jest.config.js to git
    subprocess.run(['git', 'add', 'jest.config.js'])

    # Create tsconfig.json
    setup_tsconfig()

    # Add tsconfig.json to git
    subprocess.run(['git', 'add', 'tsconfig.json'])

    # Commit the initial setup
    subprocess.run(['git', 'commit', '-m', 'Initial setup'])

def generate_unit_test(function_name):
    while True:
        try:
            messages = [
                {"role": "system", "content": f"You are a coder that writes {language} code and doesn't conversate. {code_only}"},
                {"role": "user", "content": f"Write a unit test for a function named '{function_name}' in {language}. {code_only}"}
            ]
            response = openai.ChatCompletion.create(model=model, messages=messages, max_tokens=max_tokens)
            print("Unit Test response was: %s" % json.dumps(response))
            # remove the text outside of the ``` code block given so it is only the code
            unit_test_code = response.choices[0].message['content'].split('```')[1]
            # If the code block starts with 'typescript', remove it
            if unit_test_code.startswith('typescript'):
                unit_test_code = unit_test_code.replace('typescript', '', 1)
            return unit_test_code.strip()
        except openai.error.RateLimitError:
            print("Generate Unit Tests: Model is currently overloaded. Retrying in 10 seconds...")
            time.sleep(10)

def generate_code(prompt):
    while True:
        try:
            messages = [
                {"role": "system", "content": f"You are a coder that writes {language} code and doesn't conversate. {code_only}"},
                {"role": "user", "content": prompt}
            ]
            response = openai.ChatCompletion.create(model=model, messages=messages, max_tokens=max_tokens)
            print("\n*** Code response was: %s" % json.dumps(response))

            code = response.choices[0].message['content'].split('```')[1]
            # If the code block starts with 'typescript', remove it
            if code.startswith('typescript'):
                code = code.replace('typescript', '', 1)

            return code.strip()
        except openai.error.RateLimitError:
            print("Generate Code: Model is currently overloaded. Retrying in 10 seconds...")
            time.sleep(10)

def write_to_file(code, filename):
    with open(filename, 'w') as file:
        file.write(code)

    # Add the file to git and commit the changes
    subprocess.run(['git', 'add', filename])
    subprocess.run(['git', 'commit', '-m', f'Add {filename}'])

def run_test(filename):
    result = subprocess.run(['npm', 'test', filename], stdout=subprocess.PIPE)
    return result.stdout.decode('utf-8')

def iterate_development(function_name, project_name):
    setup_npm_project(project_name)
    history = ""

    # Generate filenames based on the project name
    code_filename = f'{project_name}.ts'
    test_filename = f'{project_name}Test.ts'

    # Generate the function code first
    code = generate_code(prompt)
    history += f"\n{code}"
    print(f"\n*** Generated code:\n{code}")
    write_to_file(code, code_filename)  # Write the code to the code file

    # Then generate the unit test
    unit_test = generate_unit_test(function_name)
    history += f"\n{unit_test}"
    print(f"\n*** Generated unit test:\n{unit_test}")
    write_to_file(unit_test, test_filename)  # Write the unit test to the test file

    test_result = run_test(test_filename)
    print(f"Test result: {test_result}")
  
    while 'failed' in test_result:
        if input("ERROR! Do you want to keep iterating? (yes/no) ") == "no":
            break

        print("\n*** Test failed. Generating new code...")
        code = generate_code(prompt + " There was an error, please fix it. see: " + test_result)
        history += f"\n{code}"
        print(f"\n*** Generated code:\n{code}")
        write_to_file(code, code_filename)  # Write the new code to the code file

        test_result = run_test(test_filename)
        print(f"\n*** Test result: {test_result}")

    return 'PASS'

project_name = input("Enter the directory name for the project: ")
function_name = input(f"\n(default function name: {default_function_name})\n\nEnter the function name: ") or default_function_name
prompt = input(f"\n(default prompt: {default_prompt})\n\nEnter a detailed description of what the function should do: ") or default_prompt

print(iterate_development(function_name, project_name))
