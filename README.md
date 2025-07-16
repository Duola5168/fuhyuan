# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:** Node.js

1.  **Install dependencies:**
    ```sh
    npm install
    ```

2.  **Set up Environment Variables (Crucial for Security)**
    Create a file named `.env.local` in the root directory of the project. This file will hold your secret keys and **must not** be committed to Git.

3.  **Add your Google API Keys to `.env.local`**
    Open the `.env.local` file and add the following lines, replacing the placeholder text with your actual keys from the Google Cloud Console:

    ```
    GOOGLE_API_KEY="PASTE_YOUR_GOOGLE_API_KEY_HERE"
    GOOGLE_CLIENT_ID="PASTE_YOUR_GOOGLE_CLIENT_ID_HERE"
    ```

4.  **Run the app:**
    ```sh
    npm run dev
    ```
    The application will now be running locally and can access the keys securely.
