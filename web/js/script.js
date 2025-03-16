function greet() {
    alert("Hello, World!");
}

window.onload = function() {
    greet();
};

document.addEventListener('DOMContentLoaded', () => {
    const greetButton = document.getElementById('greetButton');
    
    greetButton.addEventListener('click', () => {
        alert('Hello from JavaScript!');
    });
});