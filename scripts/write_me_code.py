import time
import openai
import subprocess
import os
import json
import re
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
code_only = "do not conversate, do not add anything to the output except code. output with ``` at the beginning and end of the code using markdown formatting. make sure to include the needed imports in the script. type the variables, don't take the easy way out and use 'any' as a type, guard against nulls and undefined, and behave like the strict compiler option."

model = 'gpt-3.5-turbo'
max_tokens = 500  # Increase this number as needed

def setup_tsconfig():
    tsconfig = {
        "compilerOptions": {
            "target": "es5",
            "module": "commonjs",
            "strict": True,
            "esModuleInterop": True,
            "types": ["jest", "node"]
        }
    }
    with open('tsconfig.json', 'w') as f:
        json.dump(tsconfig, f, indent=2)

def install_dependencies(dependencies):
    builtin_modules = [
        "assert", "buffer", "child_process", "cluster", "console", "constants", "crypto", "dgram", "dns", "domain", "events", 
        "fs", "http", "http2", "https", "inspector", "module", "net", "os", "path", "perf_hooks", "process", "punycode", 
        "querystring", "readline", "repl", "stream", "string_decoder", "sys", "timers", "tls", "trace_events", "tty", "url", 
        "util", "v8", "vm", "wasi", "worker_threads", "zlib"
    ]
    for dep in dependencies:
        if dep not in builtin_modules:
            subprocess.run(['npm', 'install', '--save', dep])

def install_required_modules(code):
    # Find all import statements in the code
    imports = re.findall(r'import .* from \'(.*)\'', code)
    install_dependencies(imports)

def setup_npm_project(project_name, function_name):
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
    subprocess.run(['npm', 'install', '--save-dev', '@types/node']);

    # Initialize git
    subprocess.run(['git', 'init'])

     # Update the scripts in package.json
    with open('package.json') as f:
        data = json.load(f)
        data['main'] = function_name + '.ts'
        data['scripts']['install'] = 'npm install'
        data['scripts']['build'] = 'tsc'
        data['scripts']['test'] = f'jest {function_name}.test.ts'
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

def generate_unit_test(function_name, filename, code):
    while True:
        try:
            messages = [
                {"role": "system", "content": f"You are a coder that writes {language} code and doesn't conversate. {code_only}"},
                {"role": "user", "content": f"{code_only} Write a unit test for the following function named '{function_name}' located in the file '{filename}' in {language}, include it as an import DO NOT INCLUDE THE FUNCTION CODE IN THE UNIT TEST CODE, import the function from the code file. Make sure to properly mock any dependencies or external calls in the unit tests. Use Jest's mocking capabilities to simulate the behavior of these dependencies. This includes mocking any calls to the 'child_process' module's 'exec' function, specifying the types of the callback function arguments in the mock implementation. Here is the function code for reference:\n```{language}\n{code}\n```"}
            ]
            response = openai.ChatCompletion.create(model=model, messages=messages, max_tokens=max_tokens)
            print("Unit Test response was: %s" % json.dumps(response))
            # remove the text outside of the ``` code block given so it is only the code
            unit_test_code = response.choices[0].message['content'].split('```')[1]
            # If the code block starts with 'typescript', remove it
            if unit_test_code.startswith('typescript'):
                unit_test_code = unit_test_code.replace('typescript', '', 1)
            # Replace the incorrect import path with the correct one
            unit_test_code = re.sub(r'import { ' + function_name + r' } from \'[^\']*\'', f'import { function_name } from \'./{filename.replace(".ts", "")}\'', unit_test_code)
            return unit_test_code.strip()
        except openai.error.RateLimitError:
            print("Generate Unit Tests: Model is currently overloaded. Retrying in 10 seconds...")
            time.sleep(10)

def generate_code(prompt, function_name):
    while True:
        try:
            messages = [
                {"role": "system", "content": f"You are a coder that writes {language} code and doesn't conversate. {code_only}"},
                {"role": "user", "content": f"{prompt} Export the name function as a default export. Name the function as {function_name}"}
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
    setup_npm_project(project_name, function_name)
    #if not os.path.exists(project_name):
    #    os.makedirs(project_name)
    #os.chdir(project_name)  # Change to the project directory

    history = ""

    # Generate filenames based on the project name
    code_filename = f'{function_name}.ts'
    test_filename = f'{function_name}.test.ts'   

    # Generate the function code first
    code = generate_code(prompt, function_name)
    history += f"\n{code}"
    print(f"\n*** Generated code:\n{code}")
    write_to_file(code, code_filename)  # Write the code to the code file

    # Then generate the unit test
    unit_test = generate_unit_test(function_name, code_filename, code)
    history += f"\n{unit_test}"
    print(f"\n*** Generated unit test:\n{unit_test}")
    write_to_file(unit_test, test_filename)  # Write the unit test to the test file

    # Install the required modules and run the code and the test
    install_required_modules(code)
    install_required_modules(unit_test)

    test_result = ""
    try:
        test_result = run_test(test_filename)
        print(f"Test result: {test_result}")
    except Exception as e:
        print("ERROR: Test failed to run with error: " + str(e))
        test_result = str(e)        
  
    while 'failed' in test_result:
        if input("ERROR! Do you want to keep iterating? (yes/no) ") == "no":
            break

        print("\n*** Test failed. Generating new code...")
        code = generate_code(prompt + " There was an problem with the code, please fix it. see the error(s): " + test_result)
        history += f"\n{code}"
        print(f"\n*** Generated code:\n{code}")
        write_to_file(code, code_filename)  # Write the new code to the code file

        test_result = run_test(test_filename)
        print(f"\n*** Test result: {test_result}")

    if 'failed' in test_result:
        print(f"\n*** Test failed. Here is the history of the code:\n\n{history}\n\ntest result: {test_result}")
        return 'FAIL'
    return 'PASS'

project_name = input("Enter the directory name for the project: ")
function_name = input(f"\n(default function name: {default_function_name})\n\nEnter the function name: ") or default_function_name
prompt = input(f"\n(default prompt: {default_prompt})\n\nEnter a detailed description of what the function should do: ") or default_prompt

print(iterate_development(function_name, project_name))
