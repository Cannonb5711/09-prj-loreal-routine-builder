/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Helper function to show a spinner */
function showSpinner(target, message = "Loading…") {
  target.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;">
      <div class="loading-spinner"></div>
      <div style="margin-top:12px;color:var(--primary-red);font-size:18px;">${message}</div>
    </div>
  `;
}

/* Store all products for searching */
let allProducts = [];

/* Load product data from JSON file */
async function loadProducts() {
  showSpinner(productsContainer, "Loading products…");
  const response = await fetch("products.json");
  const data = await response.json();
  allProducts = data.products; // Save all products for searching
  return data.products;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  productsContainer.innerHTML = products
    .map(
      (product) => `
    <div class="product-card" data-description="${product.description}">
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
      </div>
      <div class="product-description">${product.description}</div>
    </div>
  `
    )
    .join("");
}

/* Store selected products in a list for the AI to read */
// Store the last routine created by the AI so users can ask follow-up questions
let lastRoutine = "";

/* Load selected products from localStorage if available */
let selectedProducts = [];
try {
  const savedProducts = localStorage.getItem("selectedProducts");
  if (savedProducts) {
    selectedProducts = JSON.parse(savedProducts);
  }
} catch (e) {
  selectedProducts = [];
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", async (e) => {
  const products = await loadProducts();
  const selectedCategory = e.target.value;

  /* filter() creates a new array containing only products 
     where the category matches what the user selected */
  const filteredProducts = products.filter(
    (product) => product.category === selectedCategory
  );

  displayProducts(filteredProducts);

  // Add click event to each product card to select products
  const productCards = document.querySelectorAll(".product-card");
  productCards.forEach((card, index) => {
    // Toggle product selection
    card.addEventListener("click", () => {
      const product = filteredProducts[index];
      // Compare by name and brand to avoid object reference issues
      if (
        !selectedProducts.some(
          (p) => p.name === product.name && p.brand === product.brand
        )
      ) {
        // Select product
        selectedProducts.push(product);
        card.classList.add("selected");
      } else {
        // Deselect product
        selectedProducts = selectedProducts.filter(
          (p) => !(p.name === product.name && p.brand === product.brand)
        );
        card.classList.remove("selected");
      }
      updateSelectedProductsList();
    });
    // Expand description on hover
    card.addEventListener("mouseenter", () => {
      card.classList.add("expanded");
    });
    card.addEventListener("mouseleave", () => {
      card.classList.remove("expanded");
    });
    // Set initial visual feedback
    const product = filteredProducts[index];
    if (
      selectedProducts.some(
        (p) => p.name === product.name && p.brand === product.brand
      )
    ) {
      card.classList.add("selected");
    } else {
      card.classList.remove("selected");
    }
  });

  // After reload, update the selected products list so it shows saved products
  updateSelectedProductsList();
});

/* Product search bar event */
const productSearchInput = document.getElementById("productSearch");
if (productSearchInput) {
  productSearchInput.addEventListener("input", (e) => {
    const searchTerm = e.target.value.trim().toLowerCase();
    if (searchTerm === "") {
      // If search is empty, show products from selected category (if any), otherwise show all products
      const selectedCategory = categoryFilter.value;
      if (selectedCategory) {
        const filtered = allProducts.filter(
          (product) => product.category === selectedCategory
        );
        displayProducts(filtered);
      } else {
        displayProducts(allProducts);
      }
      return;
    }
    // Filter all products by name or brand, regardless of category
    const filtered = allProducts.filter(
      (product) =>
        product.name.toLowerCase().includes(searchTerm) ||
        product.brand.toLowerCase().includes(searchTerm)
    );
    displayProducts(filtered);
  });
}

/* Show selected products in the Selected Products section */
function updateSelectedProductsList() {
  const selectedProductsList = document.getElementById("selectedProductsList");
  // Save selected products to localStorage so they persist after reload
  localStorage.setItem("selectedProducts", JSON.stringify(selectedProducts));

  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML =
      "<div class='placeholder-message'>No products selected yet.</div>";
    return;
  }
  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
        <div class="product-card">
          <img src="${product.image}" alt="${product.name}">
          <div class="product-info">
            <h3>${product.name}</h3>
            <p>${product.brand}</p>
          </div>
        </div>
      `
    )
    .join("");
}

/* Chat form submission handler - sends user message to the worker and shows response */
// Store all chat messages (user and AI) in an array
let chatHistory = [];

// When the chat form is submitted, add the user's message to history and send to AI
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const userInput = document.getElementById("userInput").value;
  if (userInput.trim() !== "") {
    chatHistory.push({ role: "user", content: userInput });
  }
  sendRoutineRequest();
  document.getElementById("userInput").value = ""; // Clear input after sending
});

/* Generate Routine button handler - sends selected products to the AI */
const generateRoutineBtn = document.getElementById("generateRoutine");
generateRoutineBtn.addEventListener("click", async () => {
  sendRoutineRequest(true);
});

/* Function to send selected products and/or user message to the AI */
async function sendRoutineRequest(forceProductsOnly = false) {
  // Get the user's message from the input box
  // If called from chat form, use last user message in chatHistory
  let userMessage = "";
  if (
    chatHistory.length > 0 &&
    chatHistory[chatHistory.length - 1].role === "user"
  ) {
    userMessage = chatHistory[chatHistory.length - 1].content;
  }

  // If there is a previous routine, add it to the prompt for context
  let routineContext = "";
  if (lastRoutine) {
    routineContext = `\n\nPrevious routine:\n${lastRoutine}`;
  }

  // Add selected products info to the message for the AI
  let productsText = "";
  if (selectedProducts.length > 0) {
    productsText =
      "\n\nSelected products:\n" +
      selectedProducts.map((p) => `- ${p.name} (${p.brand})`).join("\n");
  }

  // Build the full message for the AI
  // If there is a user message, include previous routine and selected products
  let fullMessage = userMessage + routineContext + productsText;
  // If no message is typed, send only the selected products
  if ((!userMessage && productsText) || forceProductsOnly) {
    fullMessage = productsText;
  }

  // If nothing is typed and no products are selected, show a warning and do not send
  if (!userMessage && !productsText) {
    chatWindow.innerHTML =
      "<div class='placeholder-message'>Please type a message or select products.</div>";
    return;
  }

  // Show spinner while waiting for the response
  showSpinner(chatWindow, "Thinking…");

  try {
    // Add a system message to instruct the AI to build a routine using the selected products
    // Make the system prompt very clear: always build a routine, not just list info
    const systemMessage = {
      role: "system",
      content:
        "You are a friendly and expert beauty advisor for L'Oréal. When the user selects products, ALWAYS build a step-by-step routine for them. Do NOT just list or describe the products. Instead, create a numbered routine, explaining the order to use each product, how to apply it, and any tips for best results. If the user asks a question, answer helpfully, but if products are selected, your main job is to build a routine using those products.",
    };

    // Send the user's message and system message to the worker URL using fetch
    const response = await fetch(
      "https://loreal-worker.cannonb5.workers.dev/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [systemMessage, { role: "user", content: fullMessage }],
        }),
      }
    );

    // Parse the response as JSON
    const data = await response.json();

    /* Show the assistant's reply from the API response. 
       The reply is inside data.choices[0].message.content */
    if (
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
    ) {
      // Clean up markdown symbols (#, *) for beginner-friendly display
      let cleanText = data.choices[0].message.content
        .replace(/\n/g, "<br>") // keep line breaks
        .replace(/[#*]/g, "") // remove # and *
        .replace(/<br>+/g, "<br>"); // collapse multiple <br>
      // Add the AI's reply to chat history
      chatHistory.push({ role: "assistant", content: cleanText });

      // Save the routine for follow-up questions
      // Only save if products were selected (so it's a routine, not just a general answer)
      if (selectedProducts.length > 0) {
        lastRoutine = data.choices[0].message.content;
      }

      // Display the full chat history in the chat window
      chatWindow.innerHTML = chatHistory
        .map((msg) => {
          if (msg.role === "user") {
            return `<div class='chat-bubble user-bubble'>${msg.content}</div>`;
          } else {
            return `<div class='chat-bubble ai-bubble'>${msg.content}</div>`;
          }
        })
        .join("");

      // Scroll to the bottom of the chat window so latest message is visible
      chatWindow.scrollTop = chatWindow.scrollHeight;
    } else {
      // Show the full response object as a string so you can see what the worker returns
      chatHistory.push({
        role: "assistant",
        content: JSON.stringify(data, null, 2),
      });
      chatWindow.innerHTML = chatHistory
        .map((msg) => {
          if (msg.role === "user") {
            return `<div class='chat-bubble user-bubble'>${msg.content}</div>`;
          } else {
            return `<div class='chat-bubble ai-bubble'>${msg.content}</div>`;
          }
        })
        .join("");
      chatWindow.scrollTop = chatWindow.scrollHeight;
    }
  } catch (error) {
    // If there is an error, show a friendly message
    chatWindow.innerHTML =
      "<div class='placeholder-message'>Sorry, something went wrong. Please try again!</div>";
  }
}

// Add event listener for Clear Selections button
const clearSelectionsBtn = document.getElementById("clearSelectionsBtn");
if (clearSelectionsBtn) {
  clearSelectionsBtn.addEventListener("click", () => {
    // Remove all selected products
    selectedProducts = [];
    // Save to localStorage
    localStorage.setItem("selectedProducts", JSON.stringify(selectedProducts));
    // Update the UI
    updateSelectedProductsList();
    // Remove selected style from product cards if visible
    const productCards = document.querySelectorAll(".product-card.selected");
    productCards.forEach((card) => card.classList.remove("selected"));
  });
}
