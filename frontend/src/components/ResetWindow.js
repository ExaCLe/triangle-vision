import {useState} from "react";

function ResetWindow() {
    const [style, setStyle] = useState({
        width: "100%",
        height: "100%",
        backgroundColor: "#000000"
    });
    setTimeout(() => setStyle({
        width: "100%",
        height: "100%",
        backgroundColor: "#FFFFFF"
    }), 1500)
    return (
        <div style={style}>
        </div>
    );
}

export default ResetWindow;
